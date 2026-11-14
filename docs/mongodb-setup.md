# MongoDB Atlas setup

AgriTrace connects to MongoDB through `MONGO_URI` in `api/_utils/db.js`. Mongoose creates collections when the app first writes a document; there is no database migration command to run.

## Create an Atlas database

1. Sign in to [MongoDB Atlas](https://cloud.mongodb.com), create a project, and deploy a cluster. A free cluster is sufficient for local development.
2. In **Security → Network Access**, add your current public IP address. Add the deployment's outbound addresses separately when hosting the app. Avoid `0.0.0.0/0`, which allows connections from anywhere.
3. In **Security → Database Access**, create an application database user. Grant it `readWrite` on the `agritrace` database. This is separate from your Atlas website account.
4. From the cluster, select **Connect → Drivers → Node.js** and copy its connection string. Use the `agritrace` database path and URL-encode special characters in the database user's password:

   ```text
   mongodb+srv://<database_user>:<url_encoded_password>@<cluster-host>/agritrace?retryWrites=true&w=majority&appName=AgriTrace
   ```

5. Put the real URI in the local `.env` file:

   ```dotenv
   MONGO_URI=mongodb+srv://<database_user>:<url_encoded_password>@<cluster-host>/agritrace?retryWrites=true&w=majority&appName=AgriTrace
   ```

   Do not use a `VITE_` prefix; the connection string must stay server-side. Never commit `.env`.

6. Restart the development server with `npm run dev` so it loads the updated environment.
7. Open `http://localhost:5173/api/health`. A successful connection returns `status: "ok"` and `message: "Connected to MongoDB"`. Register a test account, then view the `users` collection in Atlas **Database → Browse Collections**.

Atlas requires an IP access-list entry and a database user before a client can connect. See the official [Atlas connection guide](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/), [IP access-list guide](https://www.mongodb.com/docs/atlas/security/ip-access-list/), and [free-cluster guide](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/).

## Account security

The current user model stores passwords as plain text and the login handler compares them directly. Do not use real user passwords or production accounts until password hashing is implemented.
