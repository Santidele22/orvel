export type Clock = {
  nowIso(): string;
};

export type IdGenerator = {
  next(): string;
};
