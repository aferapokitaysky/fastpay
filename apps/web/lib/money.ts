export const formatMoney = (amountKopecks: number) => new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH" }).format(amountKopecks / 100);
