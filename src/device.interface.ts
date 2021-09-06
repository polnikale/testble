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

export enum DeviceType {
  THREADMILL = 'THREADMILL',
  XBIKE = 'XBIKE',
}

export enum CharacteristicType {
  WORKOUT = 0x20,
  WEIGHT = 0x40,
}

export interface BackendDevice {
  id: string;
  characteristicId: string;
  uniqueFields: UniqueDeviceField[];
  type: DeviceType;
  hasHeartRate?: boolean;
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
export type OnDeviceChoose = (device: BackendDevice) => void;
export type OnUniqueFieldChange = (
  type: DeviceUniqueFieldType,
  value: number,
) => void;
export type OnDisconnect = () => void;
