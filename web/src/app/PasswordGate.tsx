'use client';
import { useEffect, useState } from 'react';

const K = btoa('SimoneGarrySylvieKevein JQ');

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState(true); // assume auth until checked
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setAuth(localStorage.getItem('vl_auth') === K);
  }, []);

  function attempt() {
    if (btoa(pw) === K) {
      localStorage.setItem('vl_auth', K);
      setAuth(true);
    } else {
      setErr('Incorrect password');
    }
  }

  if (auth) return <>{children}</>;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#0a0e1a', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 340, width: '90%' }}>
        <div style={{ fontSize: '2rem', color: '#4ade80', marginBottom: 8 }}>◈</div>
        <h1 style={{ color: '#f0ece3', fontSize: '1.4rem', margin: '0 0 6px' }}>Tradecraft</h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '0 0 24px' }}>
          Private preview — access required
        </p>
        <input
          type="password"
          placeholder="Password"
          value={pw}
          onChange={e => { setPw(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '12px 16px',
            borderRadius: 10, border: '1px solid #1e293b',
            background: '#0f172a', color: '#f0ece3', fontSize: '1rem',
            outline: 'none', marginBottom: 10,
          }}
        />
        <p style={{ color: '#e05555', fontSize: '0.8rem', margin: '0 0 10px', minHeight: '1em' }}>{err}</p>
        <button
          onClick={attempt}
          style={{
            width: '100%', padding: 12, background: '#4ade80',
            color: '#0a0e1a', border: 'none', borderRadius: 10,
            fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
          }}
        >
          Enter
        </button>
      </div>
    </div>
  );
}
