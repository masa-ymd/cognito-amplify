// AWS Cognito設定
export const AWS_CONFIG = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || 'ap-northeast-1_ZEGsv1lfy',
      userPoolClientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID || 'YOUR_APP_CLIENT_ID',
      region: import.meta.env.VITE_AWS_REGION || 'ap-northeast-1',
    }
  }
};

// テナント設定（本番環境ではDB管理を推奨）
export const TENANTS = {
  'tenant1': {
    id: 'tenant1',
    name: 'テナント1',
    domain: 'tenant1.example.com',
    redirectUrl: 'http://localhost:5000?tenant=tenant1'
  },
  'tenant2': {
    id: 'tenant2',
    name: 'テナント2',
    domain: 'tenant2.example.com',
    redirectUrl: 'http://localhost:5000?tenant=tenant2'
  }
};