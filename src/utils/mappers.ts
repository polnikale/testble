import * as R from 'ramda';

const LBS_IN_KG = 2.20462;

export class ByteNumber {
  // eslint-disable-next-line no-bitwise
  static toLowerByte = (number: number) => number & 0xff;

  // eslint-disable-next-line no-bitwise
  static toHigherByte = (number: number) => (number >> 8) & 0xff;

  static toBytes = (number: number) => [
    this.toHigherByte(number),
    this.toLowerByte(number),
  ];

  static to16 = (number = 0) =>
    Number(
      Number.isNaN(Number(Number(number).toString(16)))
        ? number
        : Number(number).toString(16),
    );

  // last value is checksum
  static createByteArray = (values: number[]) =>
    Uint8Array.from([...values, R.sum(values)]);
}

export const toLbs = (weight: number) => weight * LBS_IN_KG;
