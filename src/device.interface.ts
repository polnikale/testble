import {Device} from 'react-native-ble-plx';

export enum DeviceType {
  XBike = 'X_BIKE',
  Crosstrainer = 'CROSSTRAINER',
  Treadmill = 'TREADMILL',
  Stepper = 'STEPPER',
  Mbike = 'MBIKE',
  Rower = 'ROWER',
}

export enum DeviceUniqueFieldType {
  RESISTANCE = 'RESISTANCE',
  INCLINE = 'INCLINE',
  SPEED = 'SPEED',
  COUNT = 'COUNT',
}
export enum DeviceFieldType {
  RPM = 'RPM',
  HEART_RATE = 'HEART_RATE',
  WATT = 'WATT',
  DISTANCE = 'DISTANCE',
  CALORIES = 'CALORIES',
}

export const CARDIOFIT_DEVICES_BY_BYTE: Record<number, DeviceType> = {
  [0x64]: DeviceType.Treadmill,
  [0x78]: DeviceType.XBike,
  [0x8c]: DeviceType.Crosstrainer,
  [0xa0]: DeviceType.Stepper,
  [0x96]: DeviceType.Mbike,
  [0x52]: DeviceType.Rower,
};

// merge of different devices in future
export const DEVICES_BY_BYTE = CARDIOFIT_DEVICES_BY_BYTE;

export enum CharacteristicType {
  WORKOUT = 0x20,
  INFO = 0x40,
}
export type LOCAL_ID = string;

export interface BackendDevice {
  uniqueFields: UniqueDeviceField[];
  type: DeviceType;
  hasHeartRate?: boolean;
}
export interface LocalDevice {
  localId: LOCAL_ID;
}

export type DeviceFields = DeviceField<DeviceFieldType>[];

export interface Position {
  lowByte: number;
  highByte?: number;
  highByteMultiplier?: number;
  lowByteMultiplier?: number;
  byte?: BytePosition[];
  accumulative?: boolean;
}

interface BytePosition {
  index: number;
  value: number | BitPosition[];
}

interface BitPosition {
  index: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  value: 1 | 0;
}

export type DeviceField<T extends DeviceFieldType | DeviceUniqueFieldType> = {
  type: T;
  value?: number;
  isDecimal?: boolean;
  get: Position;
  fixed?: number;
};

export type AuxiliaryDeviceField = DeviceField<DeviceFieldType>;
export type UniqueDeviceField = DeviceField<DeviceUniqueFieldType> & {
  set?: {
    byte: number;
  };
};

export type OnConnectionChange = (isConnected: boolean) => void;
export type OnStartedChange = (isStarted: boolean) => void;
export type OnDataChange = (data: DeviceFields) => void;
export type OnDeviceChoose = (device: BackendDevice, bleDevice: Device) => void;
export type OnDeviceFind = (localId: LOCAL_ID, deviceType: DeviceType) => void;
export type OnUniqueFieldChange = (
  type: DeviceUniqueFieldType,
  value: number,
) => void;
export type OnDisconnect = () => void;
