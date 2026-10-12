import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import {
  ArrowDown,
  ArrowDownUp,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { useCurrentAccount, useCurrentNetwork, useDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { formatUnits, minimumReceived, parseUnits } from './amounts.mjs';
import { buildSwapTransaction, QUOTE_TTL_MS, requestQuote, SUI_TYPE, tokenTypeFor } from './swap';
import type { Network, SwapQuote } from './swap';

const RPC_URLS = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
} as const;

type WalletBalances = { sui: bigint; eterno: bigint };
type TradeStatus = { kind: 'success'; digest: string } | null;
type TokenVerification = { ready: boolean; message: string };

function App() {
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const network = useCurrentNetwork() as Network;
  const [direction, setDirection] = useState<'sui-to-e' | 'e-to-sui'>('sui-to-e');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<TradeStatus>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [balanceError, setBalanceError] = useState('');
  const [tokenVerification, setTokenVerification] = useState<TokenVerification>({
    ready: false,
    message: 'Eterno token type is not configured for this network.',
  });
  const [now, setNow] = useState(Date.now());
  const eType = useMemo(() => tokenTypeFor(network), [network]);
  const parsedAmount = parseUnits(amount);
  const isQuoteFresh = quote !== null && now - quote.createdAt < QUOTE_TTL_MS;
  const inputSymbol = direction === 'sui-to-e' ? 'SUI' : 'E';
  const outputSymbol = direction === 'sui-to-e' ? 'E' : 'SUI';
  const inputBalance = direction === 'sui-to-e' ? balances?.sui : balances?.eterno;
  const outputAmount = quote ? formatUnits(quote.outputAmount) : '';
  const minimumOut = quote ? formatUnits(minimumReceived(quote.outputAmount)) : '';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setQuote(null);
    setStatus(null);
    setError('');
  }, [network, direction, amount, eType]);

  useEffect(() => {
    let cancelled = false;
    if (!eType) {
      setTokenVerification({
        ready: false,
        message: `Eterno is not configured for ${network}.`,
      });
      return () => {
        cancelled = true;
      };
    }
    setTokenVerification({ ready: false, message: 'Checking Eterno token metadata…' });
    const client = new SuiGrpcClient({ network, baseUrl: RPC_URLS[network] });
    client.getCoinMetadata({ coinType: eType }).then(({ coinMetadata }) => {
      if (!coinMetadata || coinMetadata.name !== 'Eterno' || coinMetadata.symbol !== 'E' || coinMetadata.decimals !== 9) {
        throw new Error('Configured coin type does not match Eterno metadata (Eterno, E, 9 decimals).');
      }
      if (!cancelled) setTokenVerification({ ready: true, message: '' });
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setTokenVerification({
          ready: false,
          message: reason instanceof Error
            ? reason.message
            : 'Could not verify Eterno metadata on this network.',
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eType, network]);

  useEffect(() => {
    if (!account || !eType) {
      setBalances(null);
      setBalanceError('');
      return;
    }
    let cancelled = false;
    const client = new SuiGrpcClient({ network, baseUrl: RPC_URLS[network] });
    Promise.all([
      client.getBalance({ owner: account.address, coinType: SUI_TYPE }),
      client.getBalance({ owner: account.address, coinType: eType }),
    ]).then(([sui, eterno]) => {
      if (!cancelled) {
        setBalances({
          sui: BigInt(sui.balance.balance),
          eterno: BigInt(eterno.balance.balance),
        });
        setBalanceError('');
      }
    }).catch(() => {
      if (!cancelled) {
        setBalances(null);
        setBalanceError('Wallet balances could not be loaded from the selected Sui network.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [account?.address, eType, network, status?.digest, tokenVerification.ready]);

  const getQuote = useCallback(async () => {
    if (!eType || !tokenVerification.ready) {
      setError(tokenVerification.message || `Configure and verify Eterno on ${network} first.`);
      return;
    }
    if (!parsedAmount) {
      setError('Enter a positive amount with no more than 9 decimal places.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus(null);
    setQuote(null);
    try {
      const nextQuote = await requestQuote(network, direction, parsedAmount, eType);
      setQuote(nextQuote);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not fetch a swap quote.');
    } finally {
      setBusy(false);
    }
  }, [direction, eType, network, parsedAmount, tokenVerification]);

  const executeSwap = useCallback(async () => {
    if (!account || !quote || !isQuoteFresh) {
      setError('Connect your wallet and refresh the expired quote before swapping.');
      return;
    }
    if (network !== quote.network || !eType || !tokenVerification.ready) {
      setError('The network or Eterno coin configuration changed. Request a new quote.');
      setQuote(null);
      return;
    }
    setBusy(true);
    setError('');
    setStatus(null);
    try {
      const transaction = await buildSwapTransaction(quote);
      transaction.setSender(account.address);
      const result = await dAppKit.signAndExecuteTransaction({ transaction, account, network });
      if (result.FailedTransaction) {
        throw new Error(result.FailedTransaction.status.error?.message ?? 'The wallet-reported transaction failed.');
      }
      setStatus({ kind: 'success', digest: result.Transaction.digest });
      setQuote(null);
      setAmount('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Swap was cancelled or failed.');
    } finally {
      setBusy(false);
    }
  }, [account, dAppKit, eType, isQuoteFresh, network, quote, tokenVerification.ready]);

  function reversePair() {
    setDirection((current) => current === 'sui-to-e' ? 'e-to-sui' : 'sui-to-e');
    setAmount('');
  }

  function setMaxAmount() {
    if (inputBalance === undefined) return;
    const reserve = direction === 'sui-to-e' ? 10_000_000n : 0n;
    const spendable = inputBalance > reserve ? inputBalance - reserve : 0n;
    setAmount(formatUnits(spendable, 9, 9).replaceAll(',', ''));
  }

  const percentRemaining = quote
    ? Math.max(0, Math.ceil((QUOTE_TTL_MS - (now - quote.createdAt)) / 1000))
    : 0;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Eterno home">
          <span className="brand-mark"><span>E</span></span>
          <span className="brand-name">ETERNO<span className="brand-period">.</span></span>
        </a>
        <nav className="top-nav" aria-label="Main navigation">
          <a className="nav-active" href="#swap">Trade</a>
          <a href="#about">About</a>
          <a href="https://github.com/MyeongjunChae/eterno-crypto-project" target="_blank" rel="noreferrer">Docs <ExternalLink size={13} /></a>
        </nav>
        <div className="header-actions">
          <label className="network-picker">
            <span className={`network-dot ${network}`} />
            <select
              aria-label="Sui network"
              value={network}
              onChange={(event) => dAppKit.switchNetwork(event.target.value as Network)}
            >
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
            <ChevronDown size={13} />
          </label>
          <ConnectButton instance={dAppKit} />
        </div>
      </header>

      <section className="hero" id="about">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> SUI ECOSYSTEM <span className="eyebrow-line" /></div>
          <h1>Trade with<br /><em>intention.</em></h1>
          <p>A considered way to swap Eterno. Find a live route, review every detail, and sign in your own wallet.</p>
          <div className="hero-trust"><ShieldCheck size={15} /> Non-custodial by design <span className="trust-separator" /> Your keys stay yours</div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit orbit-outer" />
          <div className="orbit orbit-inner" />
          <div className="orbit-core"><span>E</span></div>
          <span className="orbit-star star-one">✳</span>
          <span className="orbit-star star-two">✳</span>
          <span className="orbit-label">ET / SUI</span>
        </div>
      </section>

      <section className="trade-layout" id="swap">
        <div className="swap-column">
          <div className="section-heading">
            <div><span className="section-kicker">INSTANT SWAP</span><h2>Exchange</h2></div>
            <span className="route-source"><span className="live-dot" /> CETUS ROUTER</span>
          </div>
          <div className="swap-card">
            <div className="card-topline"><span>YOU PAY</span><span className="token-balance"><Wallet size={12} /> {account ? `Balance ${inputBalance === undefined ? '—' : formatUnits(inputBalance)} ${inputSymbol}` : 'Connect wallet to view balance'}</span></div>
            <div className="amount-box">
              <input
                aria-label={`Amount of ${inputSymbol} to pay`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(',', '.'))}
              />
              <div className="token-pill" aria-label={`Pay with ${inputSymbol}`}>
                <span className={`token-icon ${inputSymbol.toLowerCase()}`}>{inputSymbol === 'SUI' ? <span className="sui-symbol">S</span> : 'E'}</span>
                {inputSymbol}
              </div>
            </div>
            <div className="amount-meta"><span>On {network}</span>{account && <button type="button" onClick={setMaxAmount}>MAX</button>}</div>

            <button className="switch-pair" type="button" onClick={reversePair} aria-label="Reverse swap direction">
              <ArrowDown size={16} />
            </button>

            <div className="card-topline receive-topline"><span>YOU RECEIVE</span><span className="token-balance">Balance {account ? (balances === null ? '—' : formatUnits(direction === 'sui-to-e' ? balances.eterno : balances.sui)) : '—'} {outputSymbol}</span></div>
            <div className="amount-box receive-box">
              <div className={`receive-value ${quote ? '' : 'placeholder'}`}>{quote ? outputAmount : '0.00'}</div>
              <div className="token-pill" aria-label={`Receive ${outputSymbol}`}>
                <span className={`token-icon ${outputSymbol.toLowerCase()}`}>{outputSymbol === 'SUI' ? <span className="sui-symbol">S</span> : 'E'}</span>
                {outputSymbol}
              </div>
            </div>
            <div className="amount-meta"><span>Estimated output</span>{quote && <span>Min. received {minimumOut} {outputSymbol}</span>}</div>

            {quote && (
              <div className="quote-details">
                <div><span><ArrowLeftRight size={13} /> Price</span><strong>1 {inputSymbol} ≈ {formatUnits(quote.outputAmount * 10n ** 9n / quote.inputAmount)} {outputSymbol}</strong></div>
                <div><span><Zap size={13} /> Slippage tolerance</span><strong>0.50%</strong></div>
                <div><span><Clock3 size={13} /> Quote expires</span><strong className={percentRemaining < 8 ? 'expires-soon' : ''}>{percentRemaining}s</strong></div>
                <div><span><LockKeyhole size={13} /> Route</span><strong>Live Cetus aggregator quote</strong></div>
                <div><span><Wallet size={13} /> Network fee</span><strong>Shown by wallet</strong></div>
              </div>
            )}

            {!tokenVerification.ready && (
              <div className="notice"><CircleAlert size={16} /><span>{tokenVerification.message} {eType && <>Set the correct published coin type in <code>exchange-ui/.env.local</code>.</>}</span></div>
            )}
            {tokenVerification.ready && eType && (
              <div className="notice notice-muted"><ShieldCheck size={15} /><span>On-chain Eterno metadata matches E / 9 decimals. Coin type: <code>{eType}</code></span></div>
            )}
            {!account && <div className="notice notice-muted"><Wallet size={16} /><span>Connect a Sui wallet to see balances and trade. The app never asks for your recovery phrase.</span></div>}
            {account && balanceError && <div className="feedback error-feedback" role="status"><CircleAlert size={15} />{balanceError}</div>}

            {error && <div className="feedback error-feedback" role="alert"><CircleAlert size={15} />{error}</div>}
            {status && (
              <div className="feedback success-feedback" role="status">
                <Check size={15} /> Swap submitted. <a href={`https://suiscan.xyz/${network}/tx/${status.digest}`} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={13} /></a>
              </div>
            )}

            <div className="trade-actions">
              {!quote ? (
                <button className="primary-button" type="button" onClick={getQuote} disabled={busy || !eType || !tokenVerification.ready || !parsedAmount}>
                  {busy ? <><LoaderCircle className="spin" size={17} /> Finding best route</> : <>Get quote <ArrowDownUp size={16} /></>}
                </button>
              ) : (
                <button className="primary-button" type="button" onClick={executeSwap} disabled={busy || !account || !isQuoteFresh}>
                  {busy ? <><LoaderCircle className="spin" size={17} /> Waiting for wallet</> : !isQuoteFresh ? <><RefreshCw size={16} /> Quote expired — refresh</> : <>Review &amp; swap <ArrowUpRight size={16} /></>}
                </button>
              )}
              {quote && <button className="refresh-button" type="button" title="Refresh quote" onClick={getQuote} disabled={busy}><RefreshCw size={16} /></button>}
            </div>
            <p className="wallet-note"><LockKeyhole size={12} /> Your wallet reviews and signs every transaction.</p>
          </div>
          <div className="service-caption"><Sparkles size={13} /> Routes aggregated across Sui DEX liquidity sources</div>
        </div>

        <aside className="side-column">
          <div className="market-card">
            <div className="side-card-title"><span>E / SUI</span><span className="market-network">{network.toUpperCase()}</span></div>
            <div className="market-graphic">
              <div className="chart-grid" />
              <div className="chart-unavailable"><span>LIVE PRICE CHART NOT CONNECTED</span></div>
            </div>
            <div className="market-legend"><span><span className="legend-dot" /> ETERNO / SUI</span><span>Quote-based trading</span></div>
          </div>
          <div className="info-card">
            <span className="section-kicker">BUILT FOR YOU</span>
            <h3>Simple. Direct.<br /><em>Always yours.</em></h3>
            <ul>
              <li><ShieldCheck size={15} /><span><strong>Self-custody</strong>Funds never leave your wallet until you sign.</span></li>
              <li><ArrowLeftRight size={15} /><span><strong>Best-route search</strong>Quotes compare available Sui DEX routes.</span></li>
              <li><LockKeyhole size={15} /><span><strong>Open execution</strong>Review details in your wallet before approval.</span></li>
            </ul>
            <a className="learn-link" href="https://cetus-1.gitbook.io/cetus-developer-docs/developer/cetus-plus-aggregator" target="_blank" rel="noreferrer">About route aggregation <ArrowUpRight size={14} /></a>
          </div>
          <div className="warning-card"><CircleAlert size={15} /><p>Swapping involves price movement, slippage, and smart-contract risk. Quotes are estimates, not guarantees.</p></div>
        </aside>
      </section>

      <footer className="footer">
        <span>© 2026 ETERNO <span className="footer-dot">·</span> FIXED SUPPLY, OPEN NETWORK</span>
        <span className="footer-right"><span className={`network-dot ${network}`} /> Connected to Sui {network}</span>
      </footer>
    </main>
  );
}

export default App;
