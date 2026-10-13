import { createChainContext } from "./chain";
import { loadConfig } from "./config";
import { runPass, type Logger } from "./keeper";
import { KeyStore } from "./keystore";

const config = loadConfig(process.env);
const log: Logger = (event, data = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), keeper: config.keeperIndex, event, ...data }));
const store = new KeyStore(config.keyStorePath);
store.lock(); // refuses to start while another keeper process uses this KEY_STORE
const keeper = {
  chain: createChainContext(config),
  store,
  index: config.keeperIndex,
  queueTarget: config.queueTarget,
  log,
};
const once = process.argv.includes("--once");

for (;;) {
  try {
    const report = await runPass(keeper);
    if (report.sent.length > 0 || once) log("pass", { sent: report.sent });
  } catch (error) {
    log("pass-error", { error: String(error).split("\n")[0] });
  }
  if (once) break;
  await new Promise((resolve) => setTimeout(resolve, config.pollMs));
}
