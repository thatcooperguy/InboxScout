# Connecting Outlook.com / Hotmail / Live accounts

Microsoft removed password and app-password access for outside apps in 2024, so InboxScout signs in
the official way: **Microsoft Graph with a short sign-in code**. The person never types a password
into InboxScout — they type a code on Microsoft's own page.

## One-time setup (whoever installs InboxScout for the family)

Microsoft requires every app to have a free "app registration". It takes about five minutes:

1. Go to https://entra.microsoft.com → **App registrations** → **New registration**.
2. Name: `InboxScout`. Supported account types: **"Personal Microsoft accounts only"**
   (or "Accounts in any organizational directory and personal Microsoft accounts").
   Leave Redirect URI empty. Register.
3. Open **Authentication** → scroll to **Advanced settings** → set
   **Allow public client flows** to **Yes** → Save.
4. Open **API permissions** → Add a permission → Microsoft Graph → Delegated → tick **Mail.Read**
   and **User.Read** → Add.
5. Copy the **Application (client) ID** from the Overview page.
6. In InboxScout: **Setup → Preferences → Advanced → Microsoft app ID** → paste → Save.

Developers building their own installers can instead set the environment variable
`INBOXSCOUT_MS_CLIENT_ID` at build/run time.

## Connecting an account (every family member)

Setup → Email accounts → Connect an account → **Outlook.com / Hotmail / Live** → **Sign in with Microsoft**.
InboxScout shows a code like `ABCD-EFGH` and a button that opens Microsoft's sign-in page. Sign in,
type the code, allow read access — done. InboxScout only ever asks for **read** permission.

Sign-ins last a long time; if Microsoft eventually asks again, the brief will say
"Microsoft sign-in expired — reconnect this account".
