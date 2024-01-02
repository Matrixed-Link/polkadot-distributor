const readline = require('readline');
const { ApiPromise, WsProvider, Keyring, Logger } = require('@polkadot/api');
const { cryptoWaitReady } = require('@polkadot/util-crypto');
const axios = require('axios');

const wallets = [
    { name: "Validator 1", seed: "" },
    { name: "Validator 2", seed: "" },
    // Add more wallets as needed
];
const recipientAddress = 'enC3scZCeRLqggHvts2w9HKQTaxbogSaHSe4qsQiuCKiQ4Y7Y';
const minimumBalance = 0.5
const rpcUrl = "wss://enjin-relay-chain.matrixed.link";
const decimals = 18; // Number of decimals for the token

// Define the percentages for selling
const sellPercentage = 0.70; // 40% for selling

// Function to make POST requests with Axios
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3';
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
        balance = (response.data.native[0].balance - response.data.native[0].bonded);
        return balance
    }
}

// Function to send tokens
async function sendTokens(senderSeed, recipientAddress, amount) {
    try {
        const wsProvider = new WsProvider(rpcUrl);
        const api = await ApiPromise.create({ provider: wsProvider });

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
                        // for module errors, we have the section indexed, lookup
                        const decoded = api.registry.findMetaError(dispatchError.asModule);
                        const { documentation, name, section } = decoded;
                        console.error(`${section}.${name}: ${documentation.join(' ')}`);
                    } else {
                        // Other, CannotLookup, BadOrigin, no extra info
                        console.error(dispatchError.toString());
                    }
                    reject(dispatchError.toString());
                }
            });
        });
    } catch (error) {
        console.error('Failed to send tokens:', error.message);
        throw error; // Rethrow the error for further handling
    }
}


// Function to stake additional tokens
async function stakeExtraTokens(senderSeed, amount) {
    try {
        const wsProvider = new WsProvider(rpcUrl);
        const api = await ApiPromise.create({ provider: wsProvider });

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
        const balance = await fetchBalance(sender.address) - (minimumBalance * 10 ** 18);

        const tokensToSell = balance * sellPercentage;
        const tokensToStake = balance - tokensToSell;

        console.info(`${wallet.name} current balance is: ${balance / 10 ** 18} ENJ`);
        console.info(`${wallet.name} Tokens to Sell: ${tokensToSell / 10 ** decimals} ENJ`);
        console.info(`${wallet.name} Tokens to Stake: ${tokensToStake / 10 ** decimals} ENJ`);

        if (tokensToSell > (1 * 10 ** 18)) {
            await sendTokens(wallet.seed, recipientAddress, tokensToSell)
                .then(blockHash => console.info(`Transaction finalized in block: ${blockHash}`))
                .catch(error => console.error(`Error in transaction: ${error}`));

            await stakeExtraTokens(wallet.seed, tokensToStake);
        } else {
            console.error(`Not enought tokens available to process.`)
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
    process.exit(0)
}

main().catch(console.error);
