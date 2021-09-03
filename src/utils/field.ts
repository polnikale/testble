import {pipe} from 'fp-ts/lib/function';
import * as R from 'ramda';
import {
  Position,
  DeviceFieldType,
  DeviceUniqueFieldType,
  DeviceField,
} from '../device.interface';
import {ByteNumber} from './mappers';

export const getNewValue = (
  characteristics: Uint8Array,
  position: Position,
  prevValue = 0,
) => {
  if (
    position.byte?.every((rule) =>
      Array.isArray(rule.value)
        ? rule.value.every(
            (bitRule) =>
              Number(
                characteristics[rule.index]?.toString(2)?.[bitRule.index],
              ) === bitRule.value,
          )
        : rule.value === characteristics?.[rule.index],
    ) ??
    true
  ) {
    const lowerValue = ByteNumber.to16(characteristics[position.lowByte]);

    const fullLowerValue = lowerValue * (position.lowByteMultiplier ?? 1);

    const higherValue = ByteNumber.to16(
      characteristics[position.highByte ?? -1],
    );

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
          restoredValues[field.type],
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
