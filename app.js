const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const { cryptoWaitReady } = require('@polkadot/util-crypto');
const axios = require('axios');
const config = require('./config.json');

// Use values from config
const wallets = Object.entries(config.wallets).map(([name, seed]) => ({ name, seed }));
const recipientAddress = config.recipientAddress;
const minimumBalance = config.minimumBalance; 
const minimumThreshold = config.minimumThreshold
const rpcUrl = config.rpcUrl;
const decimals = config.decimals;
const sellPercentage = config.sellPercentage;

// Set useragent for scrape request
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3';

// Function to do post request
async function makePostRequest(url, postData, headers) {
    try {
        const response = await axios.post(url, postData, { headers });
        return response.data;
    } catch (error) {
        console.error(`Error in POST request to ${url}:`, error.message);
        return null;
    }
}

async function fetchBalance(account) {
    const response = await makePostRequest('https://enjin.webapi.subscan.io/api/scan/account/tokens', {
        address: account,
        row: 10
    }, {
        "accept": "application/json",
        "content-type": "application/json",
        "user-agent": userAgent
    });
    if (response) {
        const balance = (response.data.native[0].balance - response.data.native[0].bonded);
        return balance;
    }
    return 0;
}

async function createApiInstance() {
    const wsProvider = new WsProvider(rpcUrl);
    return await ApiPromise.create({ provider: wsProvider });
}

async function sendTokens(senderSeed, recipientAddress, amount) {
    try {
        const api = await createApiInstance();
        const keyring = new Keyring({ type: 'sr25519' });
        const sender = keyring.addFromUri(senderSeed);
        const amountBigInt = BigInt(amount);
        const transfer = api.tx.balances.transfer(recipientAddress, amountBigInt);

        return new Promise((resolve, reject) => {
            transfer.signAndSend(sender, ({ status, events, dispatchError }) => {
                console.debug(`Transaction status: ${status.type}`);
                if (status.isInBlock) {
                    console.debug(`Transaction included at blockHash ${status.asInBlock}`);
                } else if (status.isFinalized) {
                    console.debug(`Transaction finalized at blockHash ${status.asFinalized}`);
                    events.forEach(({ event: { data, method, section } }) => {
                        console.debug(`\t'${section}.${method}': ${data}`);
                    });
                    resolve(status.asFinalized.toString());
                } else if (dispatchError) {
                    if (dispatchError.isModule) {
                        const decoded = api.registry.findMetaError(dispatchError.asModule);
                        const { documentation, name, section } = decoded;
                        console.error(`${section}.${name}: ${documentation.join(' ')}`);
                    } else {
                        console.error(dispatchError.toString());
                    }
                    reject(dispatchError.toString());
                }
            });
        });
    } catch (error) {
        console.error('Failed to send tokens:', error.message);
        throw error;
    }
}

async function stakeExtraTokens(senderSeed, amount) {
    try {
        const api = await createApiInstance();
        const keyring = new Keyring({ type: 'sr25519' });
        const sender = keyring.addFromUri(senderSeed);
        const amountBigInt = BigInt(amount);

        const bondExtra = api.tx.staking.bondExtra(amountBigInt);
        const hash = await bondExtra.signAndSend(sender);
        console.info('Additional staking successful with hash:', hash.toHex());
    } catch (error) {
        console.error('Failed to stake extra tokens:', error.message);
    }
}

async function processWallet(wallet) {
    try {
        const keyring = new Keyring({ type: 'sr25519' });
        const sender = keyring.addFromUri(wallet.seed);
        const balance = await fetchBalance(sender.address) - (minimumBalance * 10 ** decimals);

        const tokensToSell = balance * sellPercentage;
        const tokensToStake = balance - tokensToSell;

        console.info(`${wallet.name} current balance is: ${balance / 10 ** decimals} ENJ`);
        console.info(`${wallet.name} Tokens to Sell: ${tokensToSell / 10 ** decimals} ENJ`);
        console.info(`${wallet.name} Tokens to Stake: ${tokensToStake / 10 ** decimals} ENJ`);

        if (tokensToSell > (minimumThreshold * 10 ** decimals)) {
            await sendTokens(wallet.seed, recipientAddress, tokensToSell)
                .then(blockHash => console.info(`Transaction finalized in block: ${blockHash}`))
                .catch(error => console.error(`Error in transaction: ${error}`));

            await stakeExtraTokens(wallet.seed, tokensToStake);
        } else {
            console.error(`Not enough tokens available to process.`);
        }
    } catch (error) {
        console.error(`Error processing ${wallet.name}:`, error.message);
    }
}

async function main() {
    await cryptoWaitReady();
    for (const wallet of wallets) {
        await processWallet(wallet);
    }
    process.exit(0);
}

main().catch(console.error);
