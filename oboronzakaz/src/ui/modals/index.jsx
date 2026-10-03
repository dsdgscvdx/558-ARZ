/* Показывает модальные окна из стопки S.ui.modals (верхнее — активное). */
import { S } from "../store.js";
import { OfferModal, ContractModal, TenderModal, PartnerModal } from "./Business.jsx";
import { EntModal, LineModal } from "./Ent.jsx";
import { EventModal, ConfirmNextModal, YearModal, OverModal, MenuModal, ImportModal, IntroModal, HelpModal, LoanModal, RepayModal } from "./System.jsx";

const MAP = {
  offer: OfferModal, contract: ContractModal, tender: TenderModal, partner: PartnerModal,
  ent: EntModal, line: LineModal,
  event: EventModal, confirmNext: ConfirmNextModal, year: YearModal, over: OverModal, menu: MenuModal, import: ImportModal,
  intro: IntroModal, help: HelpModal, loan: LoanModal, repay: RepayModal,
};

export function ModalHost() {
  const top = S.ui.modals[S.ui.modals.length - 1];
  if (!top) return null;
  const C = MAP[top.type];
  if (!C) return null;
  return <C key={top.id} {...top.props} />;
}
