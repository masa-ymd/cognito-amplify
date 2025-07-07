import { useState } from 'react';
import { Amplify } from 'aws-amplify';
import { signIn, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { AWS_CONFIG, TENANTS } from './config/awsConfig';
import './App.css';

// Amplifyの設定
Amplify.configure(AWS_CONFIG);

function App() {
  const [selectedTenant, setSelectedTenant] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    // 既存のセッションをクリア（開発時のデバッグ用）
    try {
      await signOut();
    } catch (e) {
      // console.warn('Amplify signOut failed or no user signed in:', e);
    }

    if (!selectedTenant) {
      setError('テナントを選択してください');
      return;
    }
    if (!username || !password) {
      setError('ユーザー名とパスワードを入力してください');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Amplifyを使ってCognitoで認証
      const { isSignedIn, nextStep } = await signIn({ username, password });

      if (!isSignedIn || nextStep.signInStep !== 'DONE') {
        throw new Error('認証が完了しませんでした。');
      }

      // 認証セッションからトークンを取得
      const { tokens } = await fetchAuthSession();

      const idToken = tokens?.idToken?.toString();
      const accessToken = tokens?.accessToken?.toString();

      if (!idToken || !accessToken) {
        throw new Error('IDトークンまたはアクセストークンが取得できませんでした。');
      }

      // 認証成功後、callback-serviceにトークンを送信してリダイレクトを依頼
      const response = await fetch('http://localhost:4000/auth/process-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id_token: idToken,
          access_token: accessToken,
          tenant: selectedTenant,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'トークン処理に失敗しました');
      }

      const redirectUrl = await response.text(); // リダイレクトURLをテキストで受け取る
      window.location.href = redirectUrl; // テナントアプリへリダイレクト

    } catch (err) {
      console.error('ログインエラー:', err);
      setError(err.message || 'ログインに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🏢 マルチテナント認証システム</h1>
        <div className="login-form">
          <h2>ログイン</h2>
          {error && <p className="error-message">{error}</p>}
          <div className="tenant-selection">
            <label htmlFor="tenant-select">テナントを選択してください：</label>
            <select
              id="tenant-select"
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              disabled={isLoading}
            >
              <option value="">-- テナントを選択 --</option>
              {Object.entries(TENANTS).map(([key, tenant]) => (
                <option key={key} value={key}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="username">ユーザー名:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="input-group">
            <label htmlFor="password">パスワード:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>
          
          <button 
            onClick={handleLogin}
            disabled={!selectedTenant || !username || !password || isLoading}
            className="login-button"
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </button>
          
          <div className="security-notice">
            <h3>⚠️ セキュリティ注意事項</h3>
            <ul>
              <li>本検証環境ではURLパラメータでテナント識別していますが、本番環境ではセキュリティリスクがあります</li>
              <li>推奨対策：subdomain方式、JWT内テナント情報、認証後の権限確認</li>
            </ul>
          </div>
        </div>
      </header>
    </div>
  );
}

export default App;
