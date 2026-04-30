const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || process.env.EXPLORER_PORT || 3000;
const RPC_URL = process.env.RPC_URL || 'https://anvil-render-q5wl.onrender.com';

// Token registry
let TOKENS = [];
try {
    if (fs.existsSync('/tmp/tokens.json')) {
        TOKENS = JSON.parse(fs.readFileSync('/tmp/tokens.json', 'utf8'));
    }
} catch(e) {}
if (TOKENS.length === 0) {
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
        { symbol: 'PEPE', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', decimals: 18, name: 'Pepe' },
        { symbol: 'AAVE', address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', decimals: 18, name: 'Aave' },
        { symbol: 'MKR', address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', decimals: 18, name: 'Maker' },
        { symbol: 'CRV', address: '0xD533a949740bb3306d119CC777fa900bA034cd52', decimals: 18, name: 'Curve DAO' },
        { symbol: '1INCH', address: '0x111111111117dC0aa78b770fA6A738034120C302', decimals: 18, name: '1inch' },
        { symbol: 'SAND', address: '0x3845badAde8e6dFF049820680d1F14bD3903a5d0', decimals: 18, name: 'The Sandbox' },
        { symbol: 'MANA', address: '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942', decimals: 18, name: 'Decentraland' },
        { symbol: 'APE', address: '0x4d224452801ACEd8B2F0aebE155379bb5D594381', decimals: 18, name: 'ApeCoin' },
        { symbol: 'ENS', address: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72', decimals: 18, name: 'ENS' },
        { symbol: 'GRT', address: '0xc944E90C64B2c07662A292be6244BDf05Cda44a7', decimals: 18, name: 'The Graph' },
        { symbol: 'SNX', address: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F', decimals: 18, name: 'Synthetix' },
    ];
}

// Cache
let cache = { stats: null, statsTime: 0 };

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Create views directory if not exists
if (!fs.existsSync(path.join(__dirname, 'views'))) {
    fs.mkdirSync(path.join(__dirname, 'views'), { recursive: true });
}
if (!fs.existsSync(path.join(__dirname, 'public'))) {
    fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
}

// ═══════════════════════════════════════════
// RPC CALL
// ═══════════════════════════════════════════
async function rpcCall(method, params = []) {
    try {
        const { data } = await axios.post(RPC_URL, {
            jsonrpc: '2.0', method, params, id: 1
        }, { timeout: 15000 });
        return data.result;
    } catch(e) {
        return null;
    }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
function weiToEth(wei) { 
    try { return (Number(BigInt(wei || '0x0')) / 1e18).toString(); } 
    catch(e) { return '0'; }
}
function hexToNum(hex) { return parseInt(hex || '0x0', 16); }
function shortAddr(a) { return a ? a.slice(0,6)+'...'+a.slice(-4) : '—'; }
function timeAgo(ts) {
    const s = Math.floor(Date.now()/1000 - parseInt(ts || '0x0', 16));
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
// DEFAULT EJS TEMPLATES (created on startup)
// ═══════════════════════════════════════════
function createTemplates() {
    const viewsDir = path.join(__dirname, 'views');
    
    // Index template
    fs.writeFileSync(path.join(viewsDir, 'index.ejs'), `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AnvilScan - Blockchain Explorer</title>
    <style>
        :root { --bg: #0d1117; --bg2: #161b22; --bg3: #21262d; --text: #c9d1d9; --text2: #8b949e; --blue: #58a6ff; --green: #3fb950; --purple: #bc8cff; --border: #30363d; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }
        .header { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 1rem 2rem; position: sticky; top: 0; z-index: 100; }
        .header-inner { max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        .logo { font-size: 1.5rem; font-weight: bold; color: var(--blue); text-decoration: none; }
        .search-box { flex: 1; max-width: 600px; }
        .search-box form { display: flex; gap: 0; }
        .search-box input { flex: 1; padding: 0.75rem 1rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px 0 0 8px; color: var(--text); font-size: 0.95rem; outline: none; }
        .search-box input:focus { border-color: var(--blue); }
        .search-box button { padding: 0.75rem 1.25rem; background: var(--blue); color: #000; border: none; border-radius: 0 8px 8px 0; font-weight: 600; cursor: pointer; }
        .nav { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 0.5rem 2rem; }
        .nav-inner { max-width: 1400px; margin: 0 auto; display: flex; gap: 1.5rem; }
        .nav a { color: var(--text2); text-decoration: none; font-size: 0.9rem; padding: 0.5rem 0; border-bottom: 2px solid transparent; }
        .nav a:hover, .nav a.active { color: var(--text); border-bottom-color: var(--blue); }
        .container { max-width: 1400px; margin: 2rem auto; padding: 0 2rem; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
        .stat-label { color: var(--text2); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; }
        .stat-value { font-size: 1.5rem; font-weight: bold; color: var(--blue); margin-top: 0.5rem; }
        .section { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 2rem; overflow: hidden; }
        .section-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 1.1rem; }
        .section-body { padding: 1.5rem; }
        .token-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
        .token-card { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; text-decoration: none; color: var(--text); transition: all 0.2s; display: flex; align-items: center; gap: 0.5rem; }
        .token-card:hover { border-color: var(--blue); transform: translateY(-1px); }
        .token-icon { width: 36px; height: 36px; border-radius: 50%; background: var(--blue); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7rem; color: #000; }
        .token-sym { font-weight: 600; }
        .token-name { font-size: 0.75rem; color: var(--text2); }
        .footer { text-align: center; padding: 2rem; color: var(--text2); border-top: 1px solid var(--border); font-size: 0.85rem; }
        @media (max-width: 768px) { .header-inner { flex-direction: column; } .search-box { max-width: 100%; } }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-inner">
            <a href="/" class="logo">⬨ AnvilScan</a>
            <div class="search-box">
                <form action="/search">
                    <input type="text" name="q" placeholder="Search by Address / Tx Hash / Block / Token...">
                    <button>🔍</button>
                </form>
            </div>
            <span style="background:var(--green);color:#000;padding:0.25rem 0.75rem;border-radius:20px;font-size:0.85rem;font-weight:600;">⚡ <%= networkName %></span>
        </div>
    </header>
    <nav class="nav">
        <div class="nav-inner">
            <a href="/" class="active">Home</a>
            <a href="/tokens">Tokens</a>
            <a href="/api">API</a>
            <a href="<%= rpc %>" target="_blank">RPC</a>
        </div>
    </nav>
    <main class="container">
        <div class="stats">
            <div class="stat-card"><div class="stat-label">Latest Block</div><div class="stat-value">#<%= blockNumber.toLocaleString() %></div></div>
            <div class="stat-card"><div class="stat-label">Gas Price</div><div class="stat-value"><%= gasPrice %> Gwei</div></div>
            <div class="stat-card"><div class="stat-label">TXs in Block</div><div class="stat-value"><%= txCount %></div></div>
            <div class="stat-card"><div class="stat-label">Tokens</div><div class="stat-value"><%= tokens %></div></div>
        </div>
        <div class="section">
            <div class="section-header">🪙 Popular Tokens</div>
            <div class="section-body">
                <div class="token-grid">
                    <% TOKENS.slice(0,12).forEach(t => { %>
                    <a href="/token/<%= t.address %>" class="token-card">
                        <div class="token-icon"><%= t.symbol.slice(0,2) %></div>
                        <div><div class="token-sym"><%= t.symbol %></div><div class="token-name"><%= t.name %></div></div>
                    </a>
                    <% }) %>
                </div>
                <a href="/tokens" style="display:inline-block;margin-top:1rem;color:var(--blue);">View all →</a>
            </div>
        </div>
    </main>
    <footer class="footer">AnvilScan Explorer • Chain ID: <%= chainId %> • RPC: <%= rpc %></footer>
</body>
</html>`);

    // Generic page template
    const genericTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AnvilScan</title>
    <style>
        :root { --bg: #0d1117; --bg2: #161b22; --bg3: #21262d; --text: #c9d1d9; --text2: #8b949e; --blue: #58a6ff; --border: #30363d; --green: #3fb950; --red: #f85149; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 2rem; }
        a { color: var(--blue); text-decoration: none; }
        .container { max-width: 1200px; margin: 0 auto; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 2rem; }
        pre { background: var(--bg3); padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; }
    </style>
</head>
<body><div class="container"><a href="/">← Back</a><br><br><%= content %></div></body>
</html>`;

    const templates = ['tokens', 'token', 'address', 'transaction', 'block', 'error'];
    templates.forEach(t => {
        fs.writeFileSync(path.join(viewsDir, `${t}.ejs`), genericTemplate);
    });
}

// ═══════════════════════════════════════════
// HOME PAGE
// ═══════════════════════════════════════════
app.get('/', async (req, res) => {
    try {
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
        res.render('index', { ...stats, networkName: 'Anvil Mainnet Fork', rpc: RPC_URL, TOKENS });
    } catch(e) {
        res.render('error', { content: '<h1>Error</h1><p>Cannot connect to RPC</p>' });
    }
});

// ═══════════════════════════════════════════
// BASIC ROUTES (render JSON for simplicity)
// ═══════════════════════════════════════════
app.get('/tokens', (req, res) => {
    let html = '<h1>🪙 Tokens</h1><table style="width:100%;border-collapse:collapse;">';
    html += '<tr><th>Symbol</th><th>Name</th><th>Address</th><th>Decimals</th></tr>';
    TOKENS.forEach(t => {
        html += `<tr><td><a href="/token/${t.address}">${t.symbol}</a></td><td>${t.name}</td><td><a href="/address/${t.address}">${shortAddr(t.address)}</a></td><td>${t.decimals}</td></tr>`;
    });
    html += '</table>';
    res.render('tokens', { content: html });
});

app.get('/token/:address', (req, res) => {
    const token = findToken(req.params.address);
    if (!token) return res.render('error', { content: '<h1>Not Found</h1><p>Token not found</p>' });
    res.render('token', { content: `<h1>${token.symbol} - ${token.name}</h1><p>Address: ${token.address}</p><p>Decimals: ${token.decimals}</p>` });
});

app.get('/address/:addr', async (req, res) => {
    try {
        const addr = req.params.addr;
        const [balance, code, txCount] = await Promise.all([
            rpcCall('eth_getBalance', [addr, 'latest']),
            rpcCall('eth_getCode', [addr, 'latest']),
            rpcCall('eth_getTransactionCount', [addr, 'latest']),
        ]);
        const ethBalance = weiToEth(balance);
        const isContract = code && code !== '0x';
        
        let tokenBalHTML = '';
        for (const token of TOKENS.slice(0, 10)) {
            const bal = await getTokenBalance(token.address, addr);
            const human = formatToken(bal, token.decimals);
            if (parseFloat(human) > 0) {
                tokenBalHTML += `<tr><td>${token.symbol}</td><td>${human}</td></tr>`;
            }
        }
        
        const html = `<h1>👛 Address</h1>
            <p><strong>Address:</strong> ${addr}</p>
            <p><strong>ETH Balance:</strong> ${Number(ethBalance).toFixed(6)} ETH</p>
            <p><strong>Type:</strong> ${isContract ? '📜 Contract' : 'Wallet (EOA)'}</p>
            <p><strong>Transactions:</strong> ${hexToNum(txCount)}</p>
            ${tokenBalHTML ? '<h2>Token Balances</h2><table>'+tokenBalHTML+'</table>' : ''}`;
        res.render('address', { content: html });
    } catch(e) {
        res.render('error', { content: '<h1>Error</h1><p>'+e.message+'</p>' });
    }
});

app.get('/tx/:hash', async (req, res) => {
    try {
        const [tx, receipt] = await Promise.all([
            rpcCall('eth_getTransactionByHash', [req.params.hash]),
            rpcCall('eth_getTransactionReceipt', [req.params.hash]),
        ]);
        if (!tx) return res.render('error', { content: '<h1>Not Found</h1><p>Transaction not found</p>' });
        const method = decodeMethod(tx.input);
        const html = `<h1>💸 Transaction</h1>
            <p><strong>Hash:</strong> ${req.params.hash}</p>
            <p><strong>From:</strong> <a href="/address/${tx.from}">${tx.from}</a></p>
            <p><strong>To:</strong> <a href="/address/${tx.to||''}">${tx.to || 'Contract Creation'}</a></p>
            <p><strong>Value:</strong> ${weiToEth(tx.value)} ETH</p>
            <p><strong>Method:</strong> ${method.name} (${method.type})</p>
            <p><strong>Block:</strong> <a href="/block/${hexToNum(tx.blockNumber)}">#${hexToNum(tx.blockNumber)}</a></p>
            <p><strong>Status:</strong> ${receipt?.status === '0x1' ? '✅ Success' : '⏳ Pending'}</p>`;
        res.render('transaction', { content: html });
    } catch(e) {
        res.render('error', { content: '<h1>Error</h1><p>'+e.message+'</p>' });
    }
});

app.get('/block/:number', async (req, res) => {
    try {
        const blockHex = '0x' + parseInt(req.params.number).toString(16);
        const block = await rpcCall('eth_getBlockByNumber', [blockHex, true]);
        if (!block) return res.render('error', { content: '<h1>Not Found</h1><p>Block not found</p>' });
        const txCount = block.transactions?.length || 0;
        const html = `<h1>📦 Block #${hexToNum(block.number)}</h1>
            <p><strong>Hash:</strong> ${block.hash}</p>
            <p><strong>Timestamp:</strong> ${timeAgo(block.timestamp)}</p>
            <p><strong>Transactions:</strong> ${txCount}</p>
            <p><strong>Gas Used:</strong> ${hexToNum(block.gasUsed)}</p>
            <p><strong>Gas Limit:</strong> ${hexToNum(block.gasLimit)}</p>
            <p><strong>Miner:</strong> <a href="/address/${block.miner}">${block.miner}</a></p>`;
        res.render('block', { content: html });
    } catch(e) {
        res.render('error', { content: '<h1>Error</h1><p>'+e.message+'</p>' });
    }
});

// ═══════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════
app.get('/search', (req, res) => {
    const q = req.query.q?.trim();
    if (!q) return res.redirect('/');
    if (/^\d+$/.test(q)) return res.redirect(`/block/${q}`);
    if (/^0x[a-fA-F0-9]{64}$/.test(q)) return res.redirect(`/tx/${q}`);
    if (/^0x[a-fA-F0-9]{40}$/.test(q)) return res.redirect(`/address/${q}`);
    res.render('error', { content: '<h1>Invalid Search</h1><p>Enter an address, tx hash, or block number.</p>' });
});

// ═══════════════════════════════════════════
// API
// ═══════════════════════════════════════════
app.get('/api', (req, res) => {
    res.json({
        name: 'AnvilScan API',
        endpoints: ['/api/status', '/api/tokens', '/api/blocks', '/api/txs', '/api/balance/:address']
    });
});

app.get('/api/status', async (req, res) => {
    try {
        const [blockNumber, chainId, gasPrice] = await Promise.all([
            rpcCall('eth_blockNumber'), rpcCall('eth_chainId'), rpcCall('eth_gasPrice')
        ]);
        res.json({
            status: 'ok', blockNumber: hexToNum(blockNumber), chainId: hexToNum(chainId),
            gasPrice: (parseInt(gasPrice,16)/1e9).toFixed(2) + ' Gwei', tokens: TOKENS.length
        });
    } catch(e) { res.json({ status: 'error' }); }
});

app.get('/api/tokens', (req, res) => res.json(TOKENS));

app.get('/api/balance/:address', async (req, res) => {
    try {
        const addr = req.params.address;
        const balance = await rpcCall('eth_getBalance', [addr, 'latest']);
        const balances = { ETH: weiToEth(balance) };
        for (const token of TOKENS.slice(0, 10)) {
            const bal = await getTokenBalance(token.address, addr);
            const human = formatToken(bal, token.decimals);
            if (parseFloat(human) > 0) balances[token.symbol] = human;
        }
        res.json({ address: addr, balances });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/blocks', async (req, res) => {
    try {
        const blockNumber = await rpcCall('eth_blockNumber');
        const latest = hexToNum(blockNumber);
        const blocks = [];
        for (let i = 0; i < 5; i++) {
            const block = await rpcCall('eth_getBlockByNumber', ['0x'+(latest-i).toString(16), false]);
            if (block) blocks.push({ number: latest-i, hash: block.hash, txCount: block.transactions?.length || 0 });
        }
        res.json(blocks);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════
createTemplates();
app.listen(PORT, () => {
    console.log(`\n🔍 AnvilScan Explorer running on port ${PORT}`);
    console.log(`📡 RPC: ${RPC_URL}`);
    console.log(`🪙 Tokens: ${TOKENS.length}\n`);
});
