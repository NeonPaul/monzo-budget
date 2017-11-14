const Koa = require("koa");
const { fetch } = require("fetch-ponyfill")();

try {
  require("./env.js");
} catch (e) {}

const app = new Koa();

const date = new Date();
const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
const err = () => {
  throw new Error("You have to set env vars");
};

const client_id = process.env.MONZO_CLIENT_ID || err();
const client_secret = process.env.MONZO_CLIENT_SECRET || err();
const redirect_uri = "http://localhost:3000";
const state_token = "abdefg";
const transactions = "https://api.monzo.com/transactions";

const exchangeToken = (code, ctx) => {
  const token = ctx.cookies.get("token");
  return token
    ? Promise.resolve(token)
    : fetch("https://api.monzo.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body:
          "grant_type=authorization_code&" +
          `client_id=${encodeURIComponent(client_id)}&` +
          `client_secret=${encodeURIComponent(client_secret)}&` +
          `redirect_uri=${encodeURIComponent(redirect_uri)}&` +
          `code=${encodeURIComponent(code)}`
      })
        .then(r => r.json())
        .then(j => {
          ctx.cookies.set("token", j.access_token);
          return j.access_token;
        });
};

const getAccountId = accessToken =>
  fetch("https://api.monzo.com/accounts", {
    headers: {
      Authorization: "Bearer " + accessToken
    }
  })
    .then(r => r.json())
    .then(j => {
      console.log(j);
      return j.accounts.filter(a => a.type === "uk_retail")[0].id;
    });

app.use(ctx => {
  const code = ctx.query.code;
  if (code) {
    return exchangeToken(code, ctx)
      .then(accessToken => {
        return getAccountId(accessToken).then(id =>
          fetch(transactions + "?account_id=" + id + "&since=" + firstDay, {
            headers: {
              Authorization: "Bearer " + accessToken
            }
          })
        );
      })
      .then(r => r.json())
      .then(
        json =>
          (ctx.body = JSON.stringify(
            json.transactions.reduce((o, t) => {
              const cat = (t.amount > 0 ? "+" : "-") + t.category;
              o[cat] = (o[cat] || 0) + t.amount / 100;
              return o;
            }, {})
          ))
      );
  } else {
    ctx.body = `<a href="https://auth.getmondo.co.uk/?client_id=${
      client_id
    }&redirect_uri=${redirect_uri}&response_type=code&state=${
      state_token
    }">Login</a>`;
  }
});

app.on("error", err => {
  console.error("server error", err);
});

app.listen(3000);
