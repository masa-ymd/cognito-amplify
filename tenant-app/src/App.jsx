import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasFetched = useRef(false); // リクエストが既に実行されたか追跡

  useEffect(() => {
    // 開発モードのStrict Modeで二度実行されるのを防ぐためのガード
    if (hasFetched.current) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');

    if (!sessionId) {
      setError(new Error("No session ID found in URL."));
      setLoading(false);
      return;
    }

    hasFetched.current = true; // リクエストが実行されることをマーク

    const fetchSessionData = async () => {
      try {
        const response = await fetch(`http://localhost:4000/api/session-data?sessionId=${sessionId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setSessionData(data);
      } catch (err) {
        console.error("Failed to fetch session data:", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSessionData();

    // クリーンアップ関数は不要（hasFetchedで制御するため）
  }, []); // 依存配列を空にして、マウント時に一度だけ実行されるようにする

  if (loading) {
    return <div className="App"><h1>セッションデータを読み込み中...</h1></div>;
  }

  if (error) {
    return <div className="App"><h1>エラー: {error.message}</h1></div>;
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>テナント: {sessionData.tenant}</h1>
        <div className="user-info-card">
          <h2>ユーザー情報</h2>
          <p><strong>Email:</strong> {sessionData.user.email}</p>
          <p><strong>Cognito Username:</strong> {sessionData.user['cognito:username']}</p>
          {/* その他のユーザー情報 */}
        </div>
        <div className="token-info-card">
          <h2>トークン情報</h2>
          <p><strong>ID Token (decoded):</strong></p>
          <pre>{JSON.stringify(sessionData.tokens.id_token ? JSON.parse(atob(sessionData.tokens.id_token.split('.')[1])) : {}, null, 2)}</pre>
          <p><strong>Access Token:</strong> {sessionData.tokens.access_token}</p>
          {/* 本番環境ではトークン全体を表示しない */}
        </div>
      </header>
    </div>
  );
}

export default App;