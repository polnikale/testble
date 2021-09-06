import {pipe} from 'fp-ts/lib/function';
import * as R from 'ramda';
import {
  DeviceField,
  DeviceFieldType,
  DeviceUniqueFieldType,
  Position,
} from '../device.interface';
import {ByteNumber} from './mappers';

export const getNewValue = (
  characteristics: Uint8Array,
  position: Position,
  prevValue: number,
  isDecimal?: boolean,
) => {
  if (
    position.byte?.every((rule) =>
      Array.isArray(rule.value)
        ? rule.value.every(
            (bitRule) =>
              Number(
                ByteNumber.to2StringReversed(characteristics[rule.index])?.[
                  bitRule.index
                ] ?? 0,
              ) === bitRule.value,
          )
        : rule.value === characteristics?.[rule.index],
    ) ??
    true
  ) {
    const lowerValue = isDecimal
      ? ByteNumber.to10(characteristics[position.lowByte])
      : ByteNumber.to16(characteristics[position.lowByte]);

    const fullLowerValue = lowerValue * (position.lowByteMultiplier ?? 1);

    const higherValue = isDecimal
      ? ByteNumber.to10(characteristics[position.highByte ?? -1])
      : ByteNumber.to16(characteristics[position.highByte ?? -1]);

    const fullHigherValue = higherValue * (position.highByteMultiplier ?? 1);

    const newValue = fullLowerValue + fullHigherValue;

    // when device is paused - data is set to 0. When data is accumulative - we want to store previous value.
    return position.accumulative ? newValue + prevValue : newValue;
  }
  return undefined;
};

export const getUpdatedFields = <
  Type extends DeviceFieldType | DeviceUniqueFieldType,
  Field extends DeviceField<Type>,
>(
  fields: Field[],
  restoredValues: Partial<Record<Type, number>>,
  characteristicArray: Uint8Array,
) =>
  pipe(
    fields,
    R.map((field) =>
      R.assoc(
        'value',
        getNewValue(
          characteristicArray,
          field.get,
          restoredValues[field.type] ?? 0,
          field.isDecimal,
        ) ?? field.value,
        field,
      ),
    ),
  );

export const updateField =
  <
    Type extends DeviceFieldType | DeviceUniqueFieldType,
    Field extends DeviceField<Type>,
  >(
    value: number,
    type: Type,
  ) =>
  (field: Field) =>
    R.assoc('value', field.type === type ? value : field.value, field);

// export const isResponseError = (characteristicArray: Uint8Array) =>
//   pipe(
//     characteristicArray,
//     (array) => array[0] ?? 0,
//     ByteNumber.to2StringReversed,
//     (bytes) =>
//       bytes.length > 3
//         ? pipe(bytes, R.slice(0, 4), R.map(Number), R.any(R.equals(1)))
//         : false,
//   );
