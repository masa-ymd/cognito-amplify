const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { CognitoIdentityProviderClient, AdminInitiateAuthCommand } = require("@aws-sdk/client-cognito-identity-provider");
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// CORS設定
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// AWS Cognito設定
const COGNITO_CONFIG = {
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_APP_CLIENT_ID,
  clientSecret: process.env.COGNITO_APP_CLIENT_SECRET,
  domain: process.env.COGNITO_DOMAIN,
  region: process.env.AWS_REGION,
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
};

// Cognito Identity Provider Clientの初期化
const cognitoClient = new CognitoIdentityProviderClient({
  region: COGNITO_CONFIG.region,
  credentials: {
    accessKeyId: COGNITO_CONFIG.awsAccessKeyId,
    secretAccessKey: COGNITO_CONFIG.awsSecretAccessKey,
  },
});

// SECRET_HASHを計算する関数
const calculateSecretHash = (username) => {
  const hmac = crypto.createHmac('sha256', COGNITO_CONFIG.clientSecret);
  hmac.update(username + COGNITO_CONFIG.clientId);
  return hmac.digest('base64');
};

// テナント設定（本番環境ではDB管理を推奨）
const TENANTS = {
  'tenant1': {
    id: 'tenant1',
    name: 'テナント1',
    redirectUrl: 'http://localhost:5000?tenant=tenant1'
  },
  'tenant2': {
    id: 'tenant2',
    name: 'テナント2',
    redirectUrl: 'http://localhost:5000?tenant=tenant2'
  }
};

// 簡易的なインメモリデータストア（本番環境ではRedis, DynamoDBなどを使用）
const sessionStore = {};

// ユーザー認証エンドポイント
app.post('/auth/authenticate-user', async (req, res) => {
  try {
    const { username, password, tenant } = req.body;

    if (!username || !password || !tenant) {
      return res.status(400).json({ error: 'Missing username, password, or tenant information' });
    }

    // SECRET_HASHを計算
    const secretHash = calculateSecretHash(username);

    // 1. Cognito AdminInitiateAuth APIを呼び出して認証
    const authCommand = new AdminInitiateAuthCommand({
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      ClientId: COGNITO_CONFIG.clientId,
      UserPoolId: COGNITO_CONFIG.userPoolId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: secretHash, // SECRET_HASHを追加
      },
      ClientMetadata: {
        tenantId: tenant, // カスタム認証フローなどで利用可能
      },
    });

    const authResponse = await cognitoClient.send(authCommand);

    const tokens = authResponse.AuthenticationResult;
    console.log('Cognito AdminInitiateAuth successful.');

    // 2. IDトークンの妥当性確認
    const verifiedIdToken = await verifyJwtToken(tokens.IdToken);
    console.log('ID Token verified successfully:', verifiedIdToken);

    // ユーザー情報の取得（IDトークンから抽出）
    const userInfo = {
      sub: verifiedIdToken.sub,
      email: verifiedIdToken.email,
      username: verifiedIdToken['cognito:username'] || verifiedIdToken.sub // Cognito User Poolの場合
    };
    console.log('User info obtained from ID Token:', userInfo);

    // 3. テナント所属確認の仮実装（本番環境では管理機能APIを呼び出す）
    const isUserAuthorizedForTenant = (userSub, tenantId) => {
      // 仮のロジック：
      // テナント1には所属しているとみなす
      if (tenantId === 'tenant1') {
        return true;
      }
      // テナント2には所属していないとみなす
      if (tenantId === 'tenant2') {
        return false;
      }
      // その他のテナントは不明としてfalse
      return false;
    };

    if (!isUserAuthorizedForTenant(userInfo.sub, tenant)) {
      console.error(`User ${userInfo.sub} is not authorized for tenant ${tenant}.`);
      return res.status(403).json({ error: 'Unauthorized tenant access' });
    }

    // 4. テナント権限の確認（TENANTSリストに存在するかどうか）
    if (!TENANTS[tenant]) {
      console.error('Invalid tenant:', tenant);
      return res.status(400).json({ error: 'Invalid tenant' });
    }

    // 5. 認証情報を簡易ストアに保存し、セッションIDを生成
    const sessionId = crypto.randomBytes(16).toString('hex');
    sessionStore[sessionId] = {
      user: userInfo,
      tenant: tenant,
      tokens: { id_token: tokens.IdToken, access_token: tokens.AccessToken, refresh_token: tokens.RefreshToken }, // トークンをそのまま保存
      timestamp: new Date().toISOString()
    };
    // 簡易ストアの有効期限を設定（例: 30秒後に削除）
    setTimeout(() => {
      delete sessionStore[sessionId];
      console.log(`Session ${sessionId} expired and removed from store.`);
    }, 1000 * 30);

    // 6. テナント専用ドメインへのリダイレクトURLを返す
    const redirectUrl = new URL(TENANTS[tenant].redirectUrl);
    redirectUrl.searchParams.set('sessionId', sessionId);
    
    console.log('Returning redirect URL:', redirectUrl.toString());
    res.status(200).send(redirectUrl.toString());

  } catch (error) {
    console.error('Authentication error:', error.response?.data || error);
    res.status(500).json({ error: error.response?.data?.message || error.message || 'Internal server error' });
  }
});

// セッションデータを取得するAPIエンドポイント
app.get('/api/session-data', (req, res) => {
  const sessionId = req.query.sessionId;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  const sessionData = sessionStore[sessionId];

  if (!sessionData) {
    return res.status(404).json({ error: 'Session data not found or expired' });
  }

  // データ返却後、ストアから削除（一度きりの使用を想定）
  delete sessionStore[sessionId];
  console.log(`Session ${sessionId} retrieved and removed from store.`);

  res.json(sessionData);
});


let jwksClientInstance = null;
async function getJwksClient() {
  if (!jwksClientInstance) {
    const { default: jwksClient } = await import('jwks-client');
    jwksClientInstance = jwksClient({
      jwksUri: `https://cognito-idp.${COGNITO_CONFIG.region}.amazonaws.com/${COGNITO_CONFIG.userPoolId}/.well-known/jwks.json`,
      cache: false, // キャッシュを無効化
      rateLimit: true,
      jwksRequestsPerMinute: 10
    });
  }
  return jwksClientInstance;
}

// JWTトークンの検証
async function verifyJwtToken(token) {
  return new Promise(async (resolve, reject) => {
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.header || !decodedHeader.header.kid) {
      return reject(new Error('Invalid token header'));
    }

    const client = await getJwksClient();
    client.getSigningKey(decodedHeader.header.kid, (err, key) => {
      if (err) {
        console.error('Error getting signing key:', err);
        return reject(new Error('Error getting signing key'));
      }
      const signingKey = key.rsaPublicKey || key.publicKey || key.getPublicKey();

      const verified = jwt.verify(token, signingKey, {
        algorithms: ['RS256'],
        issuer: `https://cognito-idp.${COGNITO_CONFIG.region}.amazonaws.com/${COGNITO_CONFIG.userPoolId}`,
      });

      // 手動でaudienceを検証
      console.log(`Verifying audience: Token aud=${decodedHeader.payload.aud}, Expected clientId=${COGNITO_CONFIG.clientId}`);
      if (decodedHeader.payload.aud !== COGNITO_CONFIG.clientId) {
        return reject(new Error('Invalid audience'));
      }
      resolve(verified);
    });
  });
}

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Callback Service running on http://localhost:${PORT}`);
});