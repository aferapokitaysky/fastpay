"use client";

import { useMemo, useState } from "react";
import type { PublicBillResponse, PublicOrderItem } from "@fastpay/contracts";
import { Money } from "./Money";

type Mode = "bill" | "split" | "checkout" | "processing" | "success";
/** Чайові — або відсоток від суми страв (з налаштувань закладу), або власна сума в копійках. */
type Tip = { kind: "percent"; percent: number } | { kind: "custom"; kopecks: number };

/**
 * Позицію можна оплатити, лише поки вона не закрита попереднім платежем.
 * Сервер — єдине джерело правди: спираємось на paymentStatus/remainingKopecks, не на локальний стан.
 */
const isPayable = (item: PublicOrderItem) => item.paymentStatus !== "paid" && item.remainingKopecks > 0;

export function GuestBill({ bill, token }: { bill: PublicBillResponse; token: string }) {
  const [mode, setMode] = useState<Mode>("bill");
  const [tip, setTip] = useState<Tip>({ kind: "percent", percent: 10 });
  const [customOpen, setCustomOpen] = useState(false);
  const [customTipInput, setCustomTipInput] = useState("");
  /** Знімок оплаченої суми: після виходу зі split-режиму `food` перераховується на весь рахунок. */
  const [paid, setPaid] = useState<{ foodKopecks: number; tipKopecks: number; at: Date } | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const items = useMemo(() => bill.order?.items ?? [], [bill.order?.items]);
  const payableIds = useMemo(() => items.filter(isPayable).map((item) => item.id), [items]);
  const [selected, setSelected] = useState<string[]>(() => payableIds.slice(0, 1));
  /** Знімок суми та екрана-джерела на момент переходу до checkout: інакше після bill->checkout `food` рахувався б за `selected` з дефолтного split-набору, а «Назад» не знав би, куди повертатись. */
  const [checkoutFood, setCheckoutFood] = useState(0);
  const [checkoutFrom, setCheckoutFrom] = useState<"bill" | "split">("bill");

  const liveFood = useMemo(() => mode === "split"
    ? items.filter((item) => isPayable(item) && selected.includes(item.id)).reduce((sum, item) => sum + item.remainingKopecks, 0)
    : bill.order?.outstandingFoodKopecks ?? 0, [bill.order?.outstandingFoodKopecks, items, mode, selected]);
  const food = mode === "checkout" ? checkoutFood : liveFood;
  const tipAmount = tip.kind === "percent" ? Math.round(food * tip.percent / 100) : tip.kopecks;
  const total = food + tipAmount;

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const setPresetTip = (percent: number) => { setCustomOpen(false); setTip({ kind: "percent", percent }); };
  const setCustomAmount = (raw: string) => {
    setCustomTipInput(raw);
    const kopecks = Math.round(Number(raw.replace(",", ".")) * 100);
    setTip({ kind: "custom", kopecks: Number.isFinite(kopecks) && kopecks > 0 ? kopecks : 0 });
  };
  const openCustomTip = () => { setCustomOpen(true); setTip({ kind: "custom", kopecks: 0 }); };
  const goToCheckout = () => { setCheckoutFood(liveFood); setCheckoutFrom(isSplit ? "split" : "bill"); setMode("checkout"); };
  const confirmPayment = () => { setPaymentError(""); if (token !== "demo-table-02") { setPaymentError("Оплата ще не підключена для цього закладу. Будь ласка, попросіть офіціанта про допомогу."); return; } const snapshot = { foodKopecks: food, tipKopecks: tipAmount, at: new Date() }; setMode("processing"); window.setTimeout(() => { setPaid(snapshot); setMode("success"); }, 900); };

  // «Ні» рендеримо завжди: сервер надсилає лише ненульові пресети (див. apps/api/src/routes/publicBill.ts),
  // а відмова від чайових обов'язкова (ТЗ §5.8) — це UI-рішення, а не серверні дані.
  const percentOptions = useMemo(() => [...new Set([0, ...bill.tips.percentOptions])].sort((a, b) => a - b), [bill.tips.percentOptions]);
  const isSplit = mode === "split";

  if (mode === "success" && paid) return <section className="screen success"><div className="success-icon" aria-hidden="true">✓</div><p className="eyebrow">ОПЛАТУ ПІДТВЕРДЖЕНО</p><h1>Дякуємо!<br />{bill.order && paid.foodKopecks < bill.order.outstandingFoodKopecks ? "Вашу частину сплачено." : "Все сплачено."}</h1><Money amountKopecks={paid.foodKopecks + paid.tipKopecks} size="lg" /><p className="receipt">{bill.venue.name} · Стіл {bill.table.label} <span suppressHydrationWarning>{new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(paid.at)}</span></p><div className="loyalty"><span aria-hidden="true">✦</span><p><b>Повернемо 5% наступного разу</b><small>Залиште номер після візиту</small></p><span aria-hidden="true">›</span></div><button className="secondary" onClick={() => setMode("bill")}>Переглянути рахунок</button></section>;
  if (mode === "processing") return <section className="screen processing"><div className="spinner" aria-hidden="true" /><p className="eyebrow">ПЕРЕВІРЯЄМО ОПЛАТУ</p><h1>Ще мить…</h1><p>Не закривайте цю сторінку, поки банк підтверджує платіж.</p></section>;
  if (mode === "checkout") return <section className="screen checkout"><button className="back" onClick={() => setMode(checkoutFrom)} aria-label="Назад до рахунку">←</button><p className="eyebrow">БЕЗПЕЧНА ОПЛАТА</p><h1>Перевірте суму</h1><p className="subtitle">{bill.venue.name} · Стіл {bill.table.label}</p><div className="checkout-total"><span>До сплати</span><Money amountKopecks={total} size="lg" /><small>Рахунок готовий до підтвердження</small></div><div className="checkout-lines"><div><span>Страви</span><Money amountKopecks={food} /></div><div><span>Чайові</span><Money amountKopecks={tipAmount} /></div></div><div className="payment-method"><span className="card-brand">••••</span><p><b>Картка, Apple Pay або Google Pay</b><small>Спосіб оплати оберете на захищеній сторінці банку</small></p><span>›</span></div><div className="checkout-safe"><span>✓</span> Дані картки не передаються ресторану</div>{paymentError&&<p role="alert">{paymentError}</p>}<button className="primary full" onClick={confirmPayment}>Перейти до оплати <span>→</span></button></section>;

  return <section className={isSplit ? "screen split" : "screen"}>
    {isSplit ? <><button className="back" onClick={() => setMode("bill")} aria-label="Назад">←</button><p className="eyebrow">СТІЛ {bill.table.label} · {bill.venue.name}</p><h1>Що оплачуєте ви?</h1><p className="subtitle">Оберіть позиції зі спільного рахунку</p></> : <><div className="venue"><div className="venue-logo">{bill.venue.name[0]}</div><div><p className="eyebrow">ВАШ РАХУНОК</p><h1>{bill.venue.name}</h1></div><span className="table">Стіл {bill.table.label}</span></div><div className="guest-meta"><p className="live" role="status">Рахунок оновлено щойно</p><span>Захищено Rimvo</span></div></>}
    <div className={isSplit ? "choices" : "card"}><p className="label">{isSplit ? "ПОЗИЦІЇ РАХУНКУ" : "ЗАМОВЛЕННЯ"}</p>{items.map((item) => {
      const payable = isPayable(item);
      if (!isSplit) return <div className={payable ? "row" : "row paid"} key={item.id}><span className="icon" aria-hidden="true">{payable ? "●" : "✓"}</span><span className="name">{item.name}<small>{payable ? <>{item.quantity} × <Money amountKopecks={item.unitPriceKopecks} /></> : "Вже сплачено"}</small></span><Money amountKopecks={payable ? item.remainingKopecks : item.unitPriceKopecks * item.quantity} /></div>;
      const isSelected = payable && selected.includes(item.id);
      return <button className={`choice${isSelected ? " selected" : ""}${payable ? "" : " paid"}`} key={item.id} onClick={() => payable && toggle(item.id)} disabled={!payable} aria-pressed={isSelected}><span className="check" aria-hidden="true">{isSelected ? "✓" : ""}</span><span className="name">{item.name}<small>{payable ? <>{item.quantity} × <Money amountKopecks={item.unitPriceKopecks} /></> : "Вже сплачено"}</small></span><Money amountKopecks={payable ? item.remainingKopecks : item.unitPriceKopecks * item.quantity} /></button>;
    })}{!isSplit && <><div className="rule" /><div className="sum"><span>Разом</span><Money amountKopecks={food} size="lg" /></div></>}</div>
    <div className="card tips"><div><p className="label">ЧАЙОВІ</p><b>Подякувати команді</b><small>{tip.kind === "percent" ? "Від суми страв" : tipAmount ? <>Чайові: <Money amountKopecks={tipAmount} /></> : "Уся сума йде ресторану"}</small></div><div className="tip-set">{percentOptions.map((value) => <button className={tip.kind === "percent" && tip.percent === value ? "tip active" : "tip"} key={value} onClick={() => setPresetTip(value)} aria-pressed={tip.kind === "percent" && tip.percent === value}>{value === 0 ? "Ні" : `${value}%`}</button>)}{bill.tips.customAllowed && <button className={tip.kind === "custom" ? "tip active custom-tip" : "tip custom-tip"} onClick={openCustomTip} aria-pressed={tip.kind === "custom"}>Своя</button>}</div>{tip.kind === "custom" && <label className="custom-tip-field">Сума чайових, ₴<input inputMode="decimal" type="number" min="0" step="1" value={customTipInput} onChange={(event) => setCustomAmount(event.target.value)} placeholder="0" autoFocus /></label>}</div>
    <div className="paybar"><div><span>{isSplit ? "Ваш рахунок" : "До сплати"}</span><Money amountKopecks={total} size="lg" /></div><button className="primary" disabled={!food} onClick={goToCheckout}>Оплатити</button></div>
    {!isSplit && payableIds.length > 1 && <button className="link" onClick={() => setMode("split")}>Розділити рахунок →</button>}
  </section>;
}
