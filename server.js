const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.EXPLORER_PORT || 3000;
const ANVIL_PORT = process.env.ANVIL_PORT || 8545;
const RPC_URL = `http://localhost:${ANVIL_PORT}`;
const PUBLIC_RPC = process.env.PUBLIC_RPC || 'https://anvil-render-q5wl.onrender.com';

// Token registry
let TOKENS = [];
try {
    TOKENS = JSON.parse(fs.readFileSync('/tmp/tokens.json', 'utf8'));
} catch(e) {
    TOKENS = [
        { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, name: 'Tether USD' },
        { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, name: 'USD Coin' },
        { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, name: 'Dai' },
        { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, name: 'Wrapped BTC' },
        { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, name: 'Wrapped ETH' },
        { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, name: 'Chainlink' },
        { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18, name: 'Uniswap' },
        { symbol: 'SHIB', address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', decimals: 18, name: 'Shiba Inu' },
        { symbol: 'MATIC', address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', decimals: 18, name: 'Polygon' },
    ];
}

// Cache for performance
let cache = {
    stats: null,
    statsTime: 0,
    blocks: null,
    blocksTime: 0,
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ═══════════════════════════════════════════
// RPC CALL HELPER
// ═══════════════════════════════════════════
async function rpcCall(method, params = []) {
    try {
        const { data } = await axios.post(RPC_URL, {
            jsonrpc: '2.0', method, params, id: 1
        }, { timeout: 10000 });
        return data.result;
    } catch(e) {
        return null;
    }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
function weiToEth(wei) { return (BigInt(wei || '0x0') / BigInt('1000000000000000000')).toString(); }
function hexToNum(hex) { return parseInt(hex, 16); }
function shortAddr(a) { return a ? a.slice(0,6)+'...'+a.slice(-4) : '—'; }
function timeAgo(ts) {
    const s = Math.floor(Date.now()/1000 - parseInt(ts,16));
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
}
function decodeMethod(input) {
    if (!input || input === '0x') return { name: 'Transfer', type: 'ETH' };
    const sig = input.slice(0,10);
    const methods = {
        '0xa9059cbb': { name: 'Transfer', type: 'ERC20' },
        '0x095ea7b3': { name: 'Approve', type: 'ERC20' },
        '0x23b872dd': { name: 'TransferFrom', type: 'ERC20' },
        '0x38ed1739': { name: 'Swap', type: 'DeFi' },
        '0x7ff36ab5': { name: 'SwapETH', type: 'DeFi' },
        '0x70a08231': { name: 'balanceOf', type: 'Read' },
        '0x313ce567': { name: 'decimals', type: 'Read' },
        '0x18160ddd': { name: 'totalSupply', type: 'Read' },
    };
    return methods[sig] || { name: sig.slice(0,8), type: 'Contract' };
}
function findToken(addr) {
    if (!addr) return null;
    return TOKENS.find(t => t.address.toLowerCase() === addr.toLowerCase()) || null;
}
async function getTokenBalance(tokenAddr, walletAddr) {
    const data = '0x70a08231' + walletAddr.toLowerCase().replace('0x','').padStart(64,'0');
    const result = await rpcCall('eth_call', [{ to: tokenAddr, data }, 'latest']);
    return result || '0x0';
}
function formatToken(amountHex, decimals) {
    try {
        const val = Number(BigInt(amountHex)) / Math.pow(10, decimals);
        if (val > 1e9) return (val/1e9).toFixed(2) + 'B';
        if (val > 1e6) return (val/1e6).toFixed(2) + 'M';
        return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch(e) { return '0'; }
}

// ═══════════════════════════════════════════
// ROUTES — PAGES
// ═══════════════════════════════════════════

// Home page
app.get('/', async (req, res) => {
    try {
        // Cache stats for 5 seconds
        let stats;
        if (cache.stats && Date.now() - cache.statsTime < 5000) {
            stats = cache.stats;
        } else {
            const [blockNumber, chainId, gasPrice] = await Promise.all([
                rpcCall('eth_blockNumber'),
                rpcCall('eth_chainId'),
                rpcCall('eth_gasPrice')
            ]);
            const latestBlock = await rpcCall('eth_getBlockByNumber', [blockNumber, true]);
            stats = {
                blockNumber: hexToNum(blockNumber),
                chainId: hexToNum(chainId),
                gasPrice: (parseInt(gasPrice,16) / 1e9).toFixed(2),
                txCount: latestBlock?.transactions?.length || 0,
                tokens: TOKENS.length,
            };
            cache.stats = stats;
            cache.statsTime = Date.now();
        }
        
        res.render('index', {
            ...stats,
            networkName: 'Anvil Mainnet Fork',
            rpc: PUBLIC_RPC,
        });
    } catch(e) {
        res.render('error', { error: 'Cannot connect to Anvil RPC' });
    }
});

// Tokens page
app.get('/tokens', (req, res) => {
    res.render('tokens', { tokens: TOKENS, rpc: PUBLIC_RPC });
});

// Single token page
app.get('/token/:address', async (req, res) => {
    const token = findToken(req.params.address);
    if (!token) return res.render('error', { error: 'Token not found' });
    
    try {
        const totalSupply = await rpcCall('eth_call', [{
            to: token.address,
            data: '0x18160ddd'
        }, 'latest']);
        
        res.render('token', {
            token,
            totalSupply: totalSupply ? formatToken(totalSupply, token.decimals) : 'N/A',
            rpc: PUBLIC_RPC,
        });
    } catch(e) {
        res.render('error', { error: 'Failed to load token data' });
    }
});

// Address page
app.get('/address/:addr', async (req, res) => {
    try {
        const addr = req.params.addr;
        const [balance, code, txCount] = await Promise.all([
            rpcCall('eth_getBalance', [addr, 'latest']),
            rpcCall('eth_getCode', [addr, 'latest']),
            rpcCall('eth_getTransactionCount', [addr, 'latest']),
        ]);
        
        const isContract = code && code !== '0x';
        const ethBalance = weiToEth(balance);
        
        // Get token info
        const tokenInfo = findToken(addr);
        
        // Get token balances (first 12 tokens)
        let tokenBalances = [];
        try {
            const results = await Promise.allSettled(
                TOKENS.slice(0, 15).map(async token => {
                    const bal = await getTokenBalance(token.address, addr);
                    const balance = formatToken(bal, token.decimals);
                    return { ...token, balance: parseFloat(balance) || 0 };
                })
            );
            tokenBalances = results
                .filter(r => r.status === 'fulfilled' && r.value.balance > 0)
                .map(r => r.value);
        } catch(e) {}
        
        // Get recent transactions
        let recentTxs = [];
        try {
            const blockNumber = await rpcCall('eth_blockNumber');
            const latest = hexToNum(blockNumber);
            for (let i = 0; i < 20 && recentTxs.length < 10; i++) {
                const block = await rpcCall('eth_getBlockByNumber', ['0x'+(latest-i).toString(16), true]);
                if (block?.transactions) {
                    for (const tx of block.transactions) {
                        if ((tx.from?.toLowerCase() === addr.toLowerCase() || 
                             tx.to?.toLowerCase() === addr.toLowerCase()) && 
                            recentTxs.length < 10) {
                            const method = decodeMethod(tx.input);
                            const tokTo = findToken(tx.to);
                            let valueDisplay = weiToEth(tx.value) + ' ETH';
                            if (method.type === 'ERC20' && tx.input?.length >= 138) {
                                const amountHex = '0x' + tx.input.slice(74,138);
                                const token = tokTo || { decimals: 18 };
                                valueDisplay = formatToken(amountHex, token.decimals) + ' ' + (tokTo?.symbol || 'TOKEN');
                            }
                            recentTxs.push({
                                hash: tx.hash,
                                from: tx.from,
                                to: tx.to,
                                value: valueDisplay,
                                method: method.name,
                                isOut: tx.from?.toLowerCase() === addr.toLowerCase(),
                                blockNum: latest - i,
                                timestamp: block.timestamp,
                            });
                        }
                    }
                }
            }
        } catch(e) {}
        
        res.render('address', {
            address: addr,
            balance: ethBalance,
            isContract,
            txCount: hexToNum(txCount),
            tokenInfo,
            tokenBalances,
            recentTxs,
            rpc: PUBLIC_RPC,
        });
    } catch(e) {
        res.render('error', { error: 'Address not found: ' + e.message });
    }
});

// Transaction page
app.get('/tx/:hash', async (req, res) => {
    try {
        const [tx, receipt] = await Promise.all([
            rpcCall('eth_getTransactionByHash', [req.params.hash]),
            rpcCall('eth_getTransactionReceipt', [req.params.hash]),
        ]);
        
        if (!tx) return res.render('error', { error: 'Transaction not found' });
        
        const method = decodeMethod(tx.input);
        const tokenTo = findToken(tx.to);
        
        // Parse token transfer
        let tokenTransfer = null;
        if (method.type === 'ERC20' && tx.input?.length >= 138) {
            const recipient = '0x' + tx.input.slice(34,74);
            const amountHex = '0x' + tx.input.slice(74,138);
            const token = tokenTo || { decimals: 18, symbol: 'TOKEN' };
            tokenTransfer = {
                recipient,
                amount: formatToken(amountHex, token.decimals),
                symbol: token.symbol,
                tokenAddress: tx.to,
            };
        }
        
        // Parse logs
        let logs = [];
        if (receipt?.logs) {
            logs = receipt.logs.slice(0, 10).map(log => {
                const logToken = findToken(log.address);
                return {
                    address: log.address,
                    tokenName: logToken ? logToken.symbol : shortAddr(log.address),
                    topics: log.topics,
                    data: log.data,
                };
            });
        }
        
        res.render('transaction', {
            tx,
            receipt,
            method,
            tokenTo,
            tokenTransfer,
            logs,
            weiToEth: w => weiToEth(w),
            hexToNum,
            timeAgo,
            shortAddr,
            rpc: PUBLIC_RPC,
        });
    } catch(e) {
        res.render('error', { error: 'Transaction not found' });
    }
});

// Block page
app.get('/block/:number', async (req, res) => {
    try {
        const blockHex = '0x' + parseInt(req.params.number).toString(16);
        const block = await rpcCall('eth_getBlockByNumber', [blockHex, true]);
        if (!block) return res.render('error', { error: 'Block not found' });
        
        let txs = [];
        if (block.transactions) {
            txs = block.transactions.slice(0, 25).map(tx => {
                const method = decodeMethod(tx.input);
                const tokenTo = findToken(tx.to);
                return {
                    hash: tx.hash,
                    from: tx.from,
                    to: tx.to,
                    value: weiToEth(tx.value),
                    method: method.name,
                    methodType: method.type,
                    tokenTo: tokenTo ? tokenTo.symbol : null,
                };
            });
        }
        
        res.render('block', {
            block,
            txs,
            hexToNum,
            timeAgo,
            shortAddr,
            rpc: PUBLIC_RPC,
        });
    } catch(e) {
        res.render('error', { error: 'Block not found' });
    }
});

// Search
app.get('/search', (req, res) => {
    const q = req.query.q?.trim();
    if (!q) return res.redirect('/');
    if (/^\d+$/.test(q)) return res.redirect(`/block/${q}`);
    if (/^0x[a-fA-F0-9]{64}$/.test(q)) return res.redirect(`/tx/${q}`);
    if (/^0x[a-fA-F0-9]{40}$/.test(q)) return res.redirect(`/address/${q}`);
    res.render('error', { error: 'Invalid search query. Enter address, tx hash, or block number.' });
});

// ═══════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════

app.get('/api', (req, res) => {
    res.json({
        name: 'AnvilScan API',
        version: '1.0.0',
        endpoints: {
            '/api/status': 'Chain status',
            '/api/tokens': 'List all tokens',
            '/api/balance/:address': 'Get address balances',
            '/api/token/:address': 'Get token info',
            '/api/blocks': 'Latest blocks',
            '/api/txs': 'Latest transactions',
        }
    });
});

app.get('/api/status', async (req, res) => {
    try {
        const [blockNumber, chainId, gasPrice] = await Promise.all([
            rpcCall('eth_blockNumber'),
            rpcCall('eth_chainId'),
            rpcCall('eth_gasPrice'),
        ]);
        res.json({
            status: 'ok',
            blockNumber: hexToNum(blockNumber),
            chainId: hexToNum(chainId),
            gasPrice: (parseInt(gasPrice,16)/1e9).toFixed(2) + ' Gwei',
            tokens: TOKENS.length,
            timestamp: new Date().toISOString(),
        });
    } catch(e) {
        res.json({ status: 'error', message: e.message });
    }
});

app.get('/api/tokens', (req, res) => {
    res.json(TOKENS);
});

app.get('/api/token/:address', (req, res) => {
    const token = findToken(req.params.address);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    res.json(token);
});

app.get('/api/balance/:address', async (req, res) => {
    try {
        const addr = req.params.address;
        const [balance, txCount] = await Promise.all([
            rpcCall('eth_getBalance', [addr, 'latest']),
            rpcCall('eth_getTransactionCount', [addr, 'latest']),
        ]);
        
        const balances = { ETH: weiToEth(balance) };
        
        // Get token balances
        for (const token of TOKENS.slice(0, 10)) {
            const bal = await getTokenBalance(token.address, addr);
            const human = formatToken(bal, token.decimals);
            if (parseFloat(human) > 0) {
                balances[token.symbol] = human;
            }
        }
        
        res.json({
            address: addr,
            txCount: hexToNum(txCount),
            balances,
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/blocks', async (req, res) => {
    try {
        const blockNumber = await rpcCall('eth_blockNumber');
        const latest = hexToNum(blockNumber);
        const blocks = [];
        for (let i = 0; i < 5; i++) {
            const block = await rpcCall('eth_getBlockByNumber', ['0x'+(latest-i).toString(16), false]);
            if (block) {
                blocks.push({
                    number: latest - i,
                    hash: block.hash,
                    timestamp: hexToNum(block.timestamp),
                    txCount: block.transactions?.length || 0,
                    miner: block.miner,
                    gasUsed: hexToNum(block.gasUsed),
                });
            }
        }
        res.json(blocks);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/txs', async (req, res) => {
    try {
        const blockNumber = await rpcCall('eth_blockNumber');
        const latest = hexToNum(blockNumber);
        let txs = [];
        for (let i = 0; i < 3 && txs.length < 10; i++) {
            const block = await rpcCall('eth_getBlockByNumber', ['0x'+(latest-i).toString(16), true]);
            if (block?.transactions) {
                for (const tx of block.transactions.slice(0, 5)) {
                    if (txs.length >= 10) break;
                    txs.push({
                        hash: tx.hash,
                        from: tx.from,
                        to: tx.to,
                        value: weiToEth(tx.value) + ' ETH',
                        blockNumber: latest - i,
                    });
                }
            }
        }
        res.json(txs);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════
app.listen(PORT, () => {
    console.log(`\n🔍 AnvilScan Explorer running on http://localhost:${PORT}`);
    console.log(`📡 Connected to RPC: ${RPC_URL}`);
    console.log(`🪙  Tokens registered: ${TOKENS.length}`);
    console.log(`🌐 Public API: http://localhost:${PORT}/api\n`);
});
