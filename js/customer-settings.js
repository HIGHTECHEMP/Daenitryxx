import {
  initCustomerDashboard
} from "./customer-shared.js";


async function init() {

  const dashboard =
    await initCustomerDashboard();

  if (!dashboard) {
    return;
  }

}


init();