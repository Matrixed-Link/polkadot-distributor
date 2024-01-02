
# Polkadot Wallet Distributor

This script processes multiple Polkadot wallets, performing token transfers and staking operations based on %.

## Configuration

Before running the script, configure your settings in a `config.json` file based on the provided `config.json.example`.

### `config.json` Structure

- `recipientAddress`: The address to receive tokens.
- `minimumBalance`: The minimum balance to maintain in each wallet.
- `minimumThreshold`: The minimum amount for processing.
- `rpcUrl`: The WebSocket URL for the Polkadot API.
- `decimals`: The number of decimals for the token.
- `sellPercentage`: The percentage of tokens to sell.
- `wallets`: An object with wallet names as keys and their seeds as values.

### Setting Up

1. Rename `config.json.example` to `config.json`.
2. Replace placeholder values with your actual configuration details.

## Usage

Run the script with Node.js:

```bash
node app.js
```

Ensure Node.js and necessary npm packages are installed.

## Security

Do not commit `config.json` to version control if it contains sensitive information. Add it to `.gitignore`.

## License

[MIT](LICENSE)
