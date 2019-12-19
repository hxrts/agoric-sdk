import harden from '@agoric/harden';
import { insist } from '@agoric/ertp/util/insist';
import { sameStructure } from '@agoric/ertp/util/sameStructure';
import { makeUnitOps } from '@agoric/ertp/core/unitOps';

const build = async (
  E,
  log,
  zoe,
  moolaPurseP,
  simoleanPurseP,
  installId,
  timer,
) => {
  const showPaymentBalance = async (paymentP, name) => {
    try {
      const units = await E(paymentP).getBalance();
      log(name, ': balance ', units);
    } catch (err) {
      console.error(err);
    }
  };

  const inviteAssay = await E(zoe).getInviteAssay();
  const moolaAssay = await E(moolaPurseP).getAssay();
  const simoleanAssay = await E(simoleanPurseP).getAssay();

  const assays = harden([moolaAssay, simoleanAssay]);

  const getLocalUnitOps = assay =>
    Promise.all([
      E(assay).getLabel(),
      E(assay).getExtentOps(),
    ]).then(([label, { name, extentOpsArgs = [] }]) =>
      makeUnitOps(label, name, extentOpsArgs),
    );

  const moolaUnitOps = await getLocalUnitOps(moolaAssay);
  const simoleanUnitOps = await getLocalUnitOps(simoleanAssay);
  const moola = moolaUnitOps.make;
  const simoleans = simoleanUnitOps.make;

  return harden({
    doAutomaticRefund: async invite => {
      const {
        extent: { instanceHandle },
      } = await E(invite).getBalance();

      const { installationHandle, terms } = await E(zoe).getInstance(
        instanceHandle,
      );

      // Bob ensures it's the contract he expects
      insist(
        installId === installationHandle,
      )`should be the expected automaticRefund`;

      insist(
        terms.assays[0] === moolaAssay,
      )`The first assay should be the moola assay`;
      insist(
        terms.assays[1] === simoleanAssay,
      )`The second assay should be the simolean assay`;

      // 1. Bob escrows his offer
      const bobOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: await E(assays[0]).makeUnits(15),
          },
          {
            kind: 'offerAtMost',
            units: await E(assays[1]).makeUnits(17),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      const bobSimoleanPayment = await E(simoleanPurseP).withdrawAll();

      const bobPayments = [undefined, bobSimoleanPayment];

      const { seat, payout: payoutP } = await E(zoe).redeem(
        invite,
        bobOfferRules,
        bobPayments,
      );

      // 2. Bob makes an offer with his escrow receipt
      const outcome = await E(seat).makeOffer();

      log(outcome);

      const bobResult = await payoutP;

      // 5: Bob deposits his winnings
      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse');
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;');
    },

    doCoveredCall: async inviteP => {
      // Bob claims all with the Zoe inviteAssay
      const invite = await E(inviteAssay).claimAll(inviteP);

      const bobIntendedOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: await E(assays[0]).makeUnits(3),
          },
          {
            kind: 'offerAtMost',
            units: await E(assays[1]).makeUnits(7),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      // Bob checks that the invite is for the right covered call
      const { extent: optionExtent } = await E(invite).getBalance();

      const instanceInfo = await E(zoe).getInstance(
        optionExtent.instanceHandle,
      );

      insist(instanceInfo.installationHandle === installId)`wrong installation`;
      insist(optionExtent.seatDesc === 'exerciseOption')`wrong seat`;
      insist(moolaUnitOps.equals(optionExtent.underlyingAsset, moola(3)));
      insist(simoleanUnitOps.equals(optionExtent.strikePrice, simoleans(7)));
      insist(optionExtent.expirationDate === 1)`wrong expirationDate`;
      insist(optionExtent.timerAuthority === timer)`wrong timer`;

      insist(
        instanceInfo.terms.assays[0] === moolaAssay,
      )`The first assay should be the moola assay`;
      insist(
        instanceInfo.terms.assays[1] === simoleanAssay,
      )`The second assay should be the simolean assay`;

      const bobSimoleanPayment = await E(simoleanPurseP).withdrawAll();
      const bobPayments = [undefined, bobSimoleanPayment];

      // Bob escrows
      const { seat, payout: payoutP } = await E(zoe).redeem(
        invite,
        bobIntendedOfferRules,
        bobPayments,
      );

      // 8: Bob makes an offer with his escrow receipt
      const bobOutcome = await E(seat).exercise();

      log(bobOutcome);

      const bobResult = await payoutP;

      // 5: Bob deposits his winnings
      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse');
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;');
    },
    doPublicAuction: async inviteP => {
      const invite = await E(inviteAssay).claimAll(inviteP);
      const { extent: inviteExtent } = await E(invite).getBalance();

      const { installationHandle, terms } = await E(zoe).getInstance(
        inviteExtent.instanceHandle,
      );

      // insist(sameStructure(bobTerms.assays, assays);
      // t.deepEquals(bobInviteExtent.minimumBid, assays[1].makeUnits(3));
      // t.deepEquals(bobInviteExtent.auctionedAssets, assays[0].makeUnits(1));

      insist(installationHandle === installId)`wrong installation`;
      insist(sameStructure(assays, terms.assays))`assays were not as expected`;

      const offerRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: await E(assays[0]).makeUnits(1),
          },
          {
            kind: 'offerAtMost',
            units: await E(assays[1]).makeUnits(11),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const simoleanPayment = await E(simoleanPurseP).withdrawAll();
      const offerPayments = [undefined, simoleanPayment];

      const { escrowReceipt, payout: payoutP } = await E(zoe).escrow(
        offerRules,
        offerPayments,
      );

      const offerResult = await E(auction).bid(escrowReceipt);

      log(offerResult);

      const bobResult = await payoutP;

      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse');
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;');
    },
    doPublicSwap: async instanceHandle => {
      const moolaAssay = await E(moolaPurseP).getAssay();
      const simoleanAssay = await E(simoleanPurseP).getAssay();

      const assays = harden([moolaAssay, simoleanAssay]);
      const { instance: swap, installationHandle, terms } = await E(
        zoe,
      ).getInstance(instanceHandle);

      insist(installationHandle === installId)`wrong installation`;
      insist(sameStructure(assays, terms.assays))`assays were not as expected`;

      const firstPayoutRules = await E(swap).getFirstPayoutRules();
      const expectedFirstPayoutRules = harden([
        {
          kind: 'offerAtMost',
          units: await E(assays[0]).makeUnits(3),
        },
        {
          kind: 'wantAtLeast',
          units: await E(assays[1]).makeUnits(7),
        },
      ]);
      insist(
        sameStructure(firstPayoutRules, expectedFirstPayoutRules),
      )`Alice's first offer was not what she said`;

      const offerRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: await E(assays[0]).makeUnits(3),
          },
          {
            kind: 'offerAtMost',
            units: await E(assays[1]).makeUnits(7),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const simoleanPayment = await E(simoleanPurseP).withdrawAll();
      const offerPayments = [undefined, simoleanPayment];

      const { escrowReceipt, payout: payoutP } = await E(zoe).escrow(
        offerRules,
        offerPayments,
      );

      const offerResult = await E(swap).matchOffer(escrowReceipt);

      log(offerResult);

      const bobResult = await payoutP;

      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse');
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;');
    },
    doSimpleExchange: async instanceHandle => {
      const moolaAssay = await E(moolaPurseP).getAssay();
      const simoleanAssay = await E(simoleanPurseP).getAssay();

      const assays = harden([moolaAssay, simoleanAssay]);
      const { instance: exchange, installationHandle, terms } = await E(
        zoe,
      ).getInstance(instanceHandle);

      insist(installationHandle === installId)`wrong installation`;
      insist(sameStructure(assays, terms.assays))`assays were not as expected`;

      const bobBuyOrderOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: await E(assays[0]).makeUnits(3),
          },
          {
            kind: 'offerAtMost',
            units: await E(assays[1]).makeUnits(7),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const simoleanPayment = await E(simoleanPurseP).withdrawAll();
      const offerPayments = [undefined, simoleanPayment];

      const { escrowReceipt, payout: payoutP } = await E(zoe).escrow(
        bobBuyOrderOfferRules,
        offerPayments,
      );

      const offerResult = await E(exchange).addOrder(escrowReceipt);

      log(offerResult);

      const bobResult = await payoutP;

      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse');
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;');
    },
    doAutoswap: async instanceHandle => {
      const moolaAssay = await E(moolaPurseP).getAssay();
      const simoleanAssay = await E(simoleanPurseP).getAssay();

      const assays = harden([moolaAssay, simoleanAssay]);
      const { instance: autoswap, installationHandle, terms } = await E(
        zoe,
      ).getInstance(instanceHandle);

      insist(installationHandle === installId)`wrong installation`;
      const liquidityAssay = await E(autoswap).getLiquidityAssay();
      const allAssays = harden([...assays, liquidityAssay]);
      insist(
        sameStructure(allAssays, terms.assays),
      )`assays were not as expected`;

      // bob checks the price of 2 moola. The price is 1 simolean
      const units2Moola = await E(moolaAssay).makeUnits(2);
      const simoleanUnits = await E(autoswap).getPrice([
        units2Moola,
        undefined,
        undefined,
      ]);
      log(simoleanUnits);

      const moolaForSimOfferRules = harden({
        payoutRules: [
          {
            kind: 'offerAtMost',
            units: await E(allAssays[0]).makeUnits(2),
          },
          {
            kind: 'wantAtLeast',
            units: await E(allAssays[1]).makeUnits(1),
          },
          {
            kind: 'wantAtLeast',
            units: await E(allAssays[2]).makeUnits(0),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      const moolaPayment = E(moolaPurseP).withdrawAll();
      const moolaForSimPayments = [moolaPayment, undefined, undefined];
      const { escrowReceipt, payout: moolaForSimPayoutP } = await E(zoe).escrow(
        moolaForSimOfferRules,
        moolaForSimPayments,
      );

      const offerResult = await E(autoswap).makeOffer(escrowReceipt);

      log(offerResult);

      const moolaForSimPayout = await moolaForSimPayoutP;

      await E(moolaPurseP).depositAll(moolaForSimPayout[0]);
      await E(simoleanPurseP).depositAll(moolaForSimPayout[1]);

      // Bob looks up the price of 3 simoleans. It's 6 moola
      const units3Sims = await E(allAssays[1]).makeUnits(3);
      const moolaUnits = await E(autoswap).getPrice([undefined, units3Sims]);
      log(moolaUnits);

      // Bob makes another offer and swaps
      const bobSimsForMoolaOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: await E(allAssays[0]).makeUnits(6),
          },
          {
            kind: 'offerAtMost',
            units: await E(allAssays[1]).makeUnits(3),
          },
          {
            kind: 'wantAtLeast',
            units: await E(allAssays[2]).makeUnits(0),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const simoleanUnits2 = await E(assays[1]).makeUnits(3);
      const bobSimoleanPayment = await E(simoleanPurseP).withdraw(
        simoleanUnits2,
      );
      const simsForMoolaPayments = [undefined, bobSimoleanPayment, undefined];

      const {
        escrowReceipt: bobsSimsForMoolaEscrowReceipt,
        payout: bobSimsForMoolaPayoutP,
      } = await E(zoe).escrow(bobSimsForMoolaOfferRules, simsForMoolaPayments);

      const simsForMoolaOutcome = await E(autoswap).makeOffer(
        bobsSimsForMoolaEscrowReceipt,
      );
      log(simsForMoolaOutcome);

      const simsForMoolaPayout = await bobSimsForMoolaPayoutP;

      await E(moolaPurseP).depositAll(simsForMoolaPayout[0]);
      await E(simoleanPurseP).depositAll(simsForMoolaPayout[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse');
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;');
    },
  });
};

const setup = (syscall, state, helpers) =>
  helpers.makeLiveSlots(syscall, state, E =>
    harden({
      build: (...args) => build(E, helpers.log, ...args),
    }),
  );
export default harden(setup);
