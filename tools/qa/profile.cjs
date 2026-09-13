exports.chooseProfile = async (page, id) => {
  await page.locator("#profileGate").waitFor({ state: "visible" });
  if (id) await page.locator('[data-profile-choice="' + id + '"]').click();
  else await page.locator("[data-profile-choice]").first().click();
  await page.locator("#profileGateConfirm").click();
  await page.locator("#profileGate").waitFor({ state: "hidden" });
};
