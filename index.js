const Koa = require("koa");
const { fetch } = require("fetch-ponyfill")();

try {
  require("./env.js");
} catch (e) {}

const category = ({ name, spent }) => `<div>
  ${name}
  <input name="${name}_budget" type="number" step="0.01">
  <output name="${name}_spent">${spent}</output>
  <output name="${name}_remaining"></output></div>`;

const app = new Koa();

const date = new Date();
const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
const err = () => {
  throw new Error("You have to set env vars");
};

const client_id = process.env.MONZO_CLIENT_ID || err();
const client_secret = process.env.MONZO_CLIENT_SECRET || err();
const port = process.env.PORT || 3000;
const redirect_uri = process.env.APP_URL || "http://localhost:" + port;
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
          const d = new Date();
          d.setFullYear(d.getFullYear() + 1);
          ctx.cookies.set("token", j.access_token, {
            expires: d
          });
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
      return j.accounts.filter(a => a.type === "uk_retail")[0].id;
    });

app.use(ctx => {
  const code = ctx.query.code;
  if (code || ctx.cookies.get("token")) {
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
      .then(json => {
        const transactions = json.transactions.reduce((o, t) => {
          const cat = t.category;
          if (t.amount < 0) {
            o[cat] = (o[cat] || 0) - t.amount / 100;
          }
          return o;
        }, {});
        ctx.body =
          Object.keys(transactions)
            .map(k => category({ name: k, spent: transactions[k] }))
            .join("") +
          `
            <script>
            const inputs = document.querySelectorAll('input')
            inputs.forEach(budget => {
              const init = localStorage.getItem(budget.name) || 0
              const spent = budget.nextElementSibling;
              const left = spent.nextElementSibling;

              const u = () => left.value = (Number(budget.value) - Number(spent.value)).toFixed(2);
              u()
              budget.addEventListener('change', e => {
                u()
                const init = localStorage.setItem(budget.name, Number(budget.value) || 0)
              })
            })
            </script>
          `;
      });
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

app.listen(port);
