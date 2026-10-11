export type SimpleBid = { step: number; quantity: number };

export function demandByStep(bids: SimpleBid[], stepCount: number): number[] {
  return Array.from({ length: stepCount }, (_, step) =>
    bids.filter((bid) => bid.step >= step).reduce((sum, bid) => sum + bid.quantity, 0),
  );
}

export function findClearingStep(demand: number[], supply: number): number {
  for (let step = demand.length - 1; step >= 0; step -= 1) {
    if (demand[step] >= supply) return step;
  }
  return 0;
}

export function allocate(bids: SimpleBid[], demand: number[], supply: number, clearing: number): number[] {
  const above = demand[clearing + 1] ?? 0;
  const atStep = demand[clearing] - above;
  const remaining = Math.max(0, supply - above);
  const fills = bids.map((bid) => {
    if (bid.step > clearing) return bid.quantity;
    if (bid.step < clearing) return 0;
    return atStep <= remaining ? bid.quantity : Math.floor((bid.quantity * remaining) / atStep);
  });
  let dust = atStep <= remaining ? 0 : remaining - fills.reduce((sum, fill, index) => sum + (bids[index].step === clearing ? fill : 0), 0);
  for (let pass = 0; pass < bids.length && dust > 0; pass += 1) {
    for (let index = 0; index < bids.length && dust > 0; index += 1) {
      if (bids[index].step === clearing && fills[index] < bids[index].quantity) {
        fills[index] += 1;
        dust -= 1;
      }
    }
  }
  return fills;
}
