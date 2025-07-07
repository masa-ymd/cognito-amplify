# Cognito + Amplify マルチテナント構成検証環境

## 概要

このプロジェクトは、Amazon CognitoとAWS Amplifyを使用したマルチテナント構成のログイン機能を検証するための環境です。
**CognitoのマネージドログインUI（Hosted UI）を使用せず、ローカルで作成したログイン画面から直接認証を行い、共通のコールバックサービスを介して各テナントアプリケーションに連携する構成**を検証します。

## 構成

```
localhost:3000 - 共通ログイン画面 (React + Amplify)
      ↓ (POST: ID/Access Token, Tenant ID)
localhost:4000 - 中間サービス (Node.js)
      ↓ (Redirect: sessionId)
localhost:5000 - テナント専用ドメイン (React)
```

## AWSコンソールでの作業指示

### 1. Cognitoアプリクライアントの作成

1.  **AWSコンソール**にログインし、**Amazon Cognito**サービスを開きます。
2.  **User pools**を選択し、既存のUser Pool（`ap-northeast-1_ZEGsv1lfy`）を選択します。
3.  左側のナビゲーションメニューから **[App integration]** をクリックします。
4.  **[App clients]** セクションで **[Create app client]** をクリックします。

#### アプリケーションクライアント設定

*   **アプリケーションタイプ**: `Single-page application (SPA)` を選択します。
    *   **重要**: この選択により、Cognitoは自動的にPKCE（Proof Key for Code Exchange）を有効化し、クライアントシークレットを生成しない「Public client」として設定します。
*   **アプリケーションに名前を付ける**: `multitenancy-demo-client` と入力します。
*   **リターン URL**: `http://localhost:3000` を入力します。
    *   **注意**: これは、Amplifyが認証後にトークンを処理するために使用するURLです。以前のHosted UIフローとは異なります。

5.  画面下部の **[アプリケーションクライアントを作成]** ボタンをクリックします。

### 2. 作成後の詳細設定

クライアント作成後、そのクライアントの詳細設定ページに移動します。

1.  ページ上部にある **[Edit]** ボタンをクリックします。
2.  **[Allowed sign-out URLs]** という項目を探し、**[Add another URL]** をクリックして `http://localhost:3000/logout` を入力します。
3.  **[OAuth 2.0 grant types]** が `Authorization code grant` になっていることを確認します。
4.  **[OpenID Connect scopes]** で、`openid`, `email`, `profile` の3つすべてにチェックが入っていることを確認します。（もしチェックされていなければ、チェックを追加してください）
5.  **[Proof Key for Code Exchange (PKCE)]** のチェックボックスが**オン**になっていることを確認します。（SPAタイプの場合、デフォルトでオンになっています）
6.  ページ最下部の **[Save changes]** ボタンをクリックして、変更を保存します。

### 3. 作成後の設定値確認

アプリクライアント作成後、以下の値を確認してください：

*   **User Pool ID**: `YOUR_USER_POOL_ID` (環境固有の値)
*   **App client ID**: （新しく作成されたクライアントID）
*   **Domain**: `https://your-domain-prefix.auth.ap-northeast-1.amazoncognito.com`
    *   **注意**: このドメインは、`callback-service`がJWKSエンドポイントやUserInfoエンドポイントを呼び出すために使用します。Hosted UIは使用しません。

## セキュリティ考慮事項

### 1. トークン連携方法の変更とリスク

*   **現在の実装**: `callback-service`は認証情報を簡易的なインメモリストアに保存し、その`sessionId`をURLパラメータとして`tenant-app`に渡します。`tenant-app`は`sessionId`を使って`callback-service`のAPIを呼び出し、認証情報を取得します。
*   **リスク**: `sessionId`自体は機密情報ではありませんが、URLパラメータとして渡されるため、ブラウザ履歴、リファラーヘッダー、サーバーログなどに記録される可能性があります。`sessionId`が漏洩した場合、有効期限内であれば認証情報が取得されるリスクがあります。
*   **推奨対策**: 本番環境では、`sessionId`をURLパラメータではなく、HttpOnlyかつSecure属性を持つCookieとして設定するか、より堅牢なセッション管理（例: Redis, DynamoDB）と組み合わせるべきです。

### 2. テナント所属確認の仮実装

*   **現在の実装**: `callback-service`内で、ユーザーがログインしようとしているテナントに所属するかどうかを**仮のロジック**で判定しています（`tenant1`は許可、`tenant2`は拒否）。
*   **リスク**: この仮実装は検証用であり、本番環境ではユーザー管理システム（例: データベース、外部API）と連携し、ユーザーの実際のテナント所属情報を確認する必要があります。

### 3. `jsonwebtoken`の`audience`検証の回避

*   **現在の実装**: `callback-service`のJWT検証において、`jsonwebtoken`ライブラリの組み込み`audience`検証機能が期待通りに動作しないため、**手動で`aud`クレームを検証**しています。
*   **注意**: これはライブラリの特定の挙動を回避するための暫定的な措置です。本番環境では、この問題の原因を特定し、ライブラリのバージョン調整や、より堅牢なJWT検証ライブラリの導入を検討することが望ましいです。

## テナント管理

現在の実装では検証のためハードコードしていますが、本番環境では以下の管理方法を推奨します：

```javascript
// 検証用ハードコード（本番ではDB管理を推奨）
const TENANTS = {
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
```

## インストールと起動

### 1. 依存関係のインストール

```bash
# ルートディレクトリで実行
npm install

# 各サービスの依存関係をインストール
cd login-app && npm install && cd ..
cd callback-service && npm install && cd ..
cd tenant-app && npm install && cd ..
```

### 2. 環境変数の設定

#### login-app/.env

```env
VITE_COGNITO_USER_POOL_ID=YOUR_USER_POOL_ID
VITE_COGNITO_APP_CLIENT_ID=YOUR_APP_CLIENT_ID
```

#### callback-service/.env

```env
COGNITO_USER_POOL_ID=YOUR_USER_POOL_ID
COGNITO_APP_CLIENT_ID=YOUR_APP_CLIENT_ID
COGNITO_DOMAIN=https://your-domain-prefix.auth.ap-northeast-1.amazoncognito.com
AWS_REGION=ap-northeast-1
PORT=4000
```

### 3. サービスの起動

#### 個別起動（推奨）

```bash
# ターミナル1: 共通ログイン画面
cd login-app && npm run dev

# ターミナル2: 中間サービス
cd callback-service && npm run dev

# ターミナル3: テナント専用ドメイン
cd tenant-app && npm run dev
```

#### 同時起動

```bash
# ルートディレクトリで実行
npm start
```

### 4. アクセスURL

*   **共通ログイン画面**: http://localhost:3000
*   **中間サービス**: http://localhost:4000
*   **テナント専用ドメイン**: http://localhost:5000

## 認証フロー

1.  ユーザーが `localhost:3000` でテナントを選択し、ユーザー名とパスワードを入力してログイン。
2.  `login-app` が Amplify を使用して Cognito の認証APIを直接呼び出し、認証セッションを確立し、IDトークンとアクセストークンを取得。
3.  `login-app` が取得したトークンとテナントIDを `callback-service` の `/auth/process-token` エンドポイントに POST リクエストで送信。
4.  `callback-service` で：
    *   IDトークンの妥当性検証（署名、発行者、有効期限、`audience`の手動検証）。
    *   ユーザーのテナント所属確認（仮実装）。
    *   認証情報を簡易ストアに保存し、一意の`sessionId`を生成。
5.  `callback-service` が `tenant-app` へのリダイレクトURL（`sessionId`を含む）を `login-app` に返す。
6.  `login-app` が受け取ったURLにブラウザをリダイレクト。
7.  `tenant-app` がURLから`sessionId`を読み取り、`callback-service`の`/api/session-data`エンドポイントを呼び出して認証情報を取得。
8.  `tenant-app` が取得した認証情報（アクセストークンなど）を表示。

## 検証手順

### 1. AWSコンソールでアプリクライアントを作成後、以下の値を確認

*   **App client ID**: Cognitoコンソールで確認できます
*   **Domain**: 設定したCognitoドメイン

### 2. 環境変数ファイルを作成

上記の「環境変数の設定」セクションを参考に、各サービスの`.env`ファイルを作成してください。

### 3. 認証フローの検証

1.  http://localhost:3000 にアクセス。
2.  ユーザー名とパスワードを入力し、テナントを選択してログイン。
3.  `callback-service`のコンソールログでトークン検証やテナント所属確認のログを確認。
4.  `tenant-app`にリダイレクトされ、ユーザー情報とトークンが表示されることを確認。

### 4. 動作確認ポイント

*   **テナント1でログイン**: 正常に`tenant-app`にリダイレクトされ、情報が表示される。
*   **テナント2でログイン**: `login-app`に戻り、`unauthorized_tenant_access`エラーが表示される。
*   **ログ確認**: `callback-service`のコンソールログで、各ステップの処理状況を確認。

## 特記事項

### 1. マネージドログインUIの不使用

*   本構成では、CognitoのHosted UIを使用せず、`login-app`でカスタムのログイン画面を実装しています。これにより、デザインの自由度が高まります。

### 2. Amplify v6の認証フロー

*   `login-app`では、Amplify v6の`signIn`と`fetchAuthSession`を組み合わせて認証を行っています。`signIn`は認証フローのステップを管理し、`fetchAuthSession`で実際のトークンを取得します。

### 3. `callback-service`の役割

*   `callback-service`は、Cognitoからの認可コードを受け取るのではなく、`login-app`から直接IDトークンとアクセストークンを受け取り、その妥当性を検証します。
*   認証後のテナント所属確認、認証情報の簡易ストアへの保存、`sessionId`の発行、そして`tenant-app`へのリダイレクトURLの返却を行います。

### 4. `jsonwebtoken`の`audience`検証の回避

*   `callback-service`のJWT検証において、`jsonwebtoken`ライブラリの組み込み`audience`検証機能が期待通りに動作しないため、**手動で`aud`クレームを検証**しています。
*   `jwt.verify`は署名、発行者、有効期限の検証を行い、その後に`decodedHeader.payload.aud`と`COGNITO_CONFIG.clientId`を比較しています。
*   この挙動はライブラリの特定のバージョンや環境に起因する可能性があり、本番環境では原因究明または代替ライブラリの検討が望ましいです。

### 5. セッションデータ連携のセキュリティ

*   `callback-service`から`tenant-app`への認証情報連携は、`sessionId`をURLパラメータとして渡し、`tenant-app`がAPIコールでデータを取得する方式です。
*   `callback-service`の`sessionStore`は**インメモリの簡易実装**であり、プロセス再起動でデータが失われます。本番環境では**DynamoDBやRedisなどの永続的なストアへの移行が必須**です。
*   `sessionId`のURLパラメータ渡しは、セキュリティリスク（ブラウザ履歴、リファラーヘッダーなど）を伴います。本番環境では、HttpOnly CookieやPOSTリクエストによる連携など、より安全な方法への切り替えを検討してください。

### 6. テナント所属確認の重要性

*   `callback-service`内の`isUserAuthorizedForTenant`関数は、テナント所属確認の**仮実装**です。本番環境では、実際のユーザー管理システム（例: データベース、外部API）と連携し、ユーザーがログインしようとしているテナントに実際にアクセス権限があるかを厳密に確認するロジックを実装する必要があります。

---