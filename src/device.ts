import * as R from 'ramda';
import base64 from 'base64-js';
import {
  BleError,
  Characteristic,
  ConnectionPriority,
  Device,
  Subscription,
} from 'react-native-ble-plx';
import {pipe} from 'fp-ts/lib/function';

export enum DeviceUniqueField {
  RESISTANCE = 'RESISTANCE',
  INCLINE = 'INCLINE',
  SPEED = 'SPEED',
  COUNT = 'COUNT',
}
export enum DeviceField {
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

const LBS_IN_KG = 2.20462;

export interface IDevice {
  id: string;
  characteristicId: string;
  uniqueFields: Record<string, UniqueField>;
  type: DeviceType;
  hasHeartRate?: boolean;
}

export type IData = {
  type: DeviceField;
  value: number;
}[];

interface Position {
  lowByte: number;
  highByte?: number;
  highByteMultiplier?: number;
  lowByteMultiplier?: number;
  byte?: BytePosition[];
  accumulative?: boolean;
}

export interface UniqueField {
  type: DeviceUniqueField;
  value?: number;
  get: Position;
  set?: {
    byte: number;
  };
}

type Tuple<T1, T2> = [T1, T2];

interface BytePosition {
  index: number;
  value: number | BitPosition[];
}

interface BitPosition {
  index: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  value: 1 | 0;
}

interface DeviceFieldData {
  type: DeviceField;
  value: number;
  position: Position;
}

// the last value is checksum
const createByteArray = (values: number[]) =>
  Uint8Array.from([...values, R.sum(values)]);

type OnConnectionChange = (isConnected: boolean) => void;
type OnStartedChange = (isStarted: boolean) => void;
type OnDataChange = (data: IData) => void;
export type OnDeviceChoose = (device: IDevice) => void;
export type OnUniqueFieldChange = (id: string, value: number) => void;
export type OnDisconnect = () => void;

export default class SPDevice {
  public device?: Device;
  private uniqueFields?: Record<string, UniqueField>;
  private characteristic?: Characteristic;
  private characteristicListener?: Subscription;
  private disconnectListener?: Subscription;
  private backendDevice?: IDevice;
  private availableBackendDevices: IDevice[];

  private weight?: number;

  private DEVICE_FIELDS: Record<DeviceField, DeviceFieldData> = {
    [DeviceField.HEART_RATE]: {
      type: DeviceField.HEART_RATE,
      position: {
        lowByte: 8,
        byte: [
          {
            index: 1,
            value: 48,
          },
        ],
      },
      value: 0,
    },
    [DeviceField.DISTANCE]: {
      type: DeviceField.DISTANCE,
      position: {
        lowByte: 5,
        lowByteMultiplier: 10,
        highByte: 4,
        highByteMultiplier: 1000,
        byte: [
          {
            index: 1,
            value: 48,
          },
        ],
        accumulative: true,
      },
      value: 0,
    },

    [DeviceField.CALORIES]: {
      type: DeviceField.CALORIES,
      position: {
        lowByte: 7,
        highByte: 6,
        highByteMultiplier: 100,
        byte: [
          {
            index: 1,
            value: 48,
          },
        ],
        accumulative: true,
      },
      value: 0,
    },
    [DeviceField.RPM]: {
      type: DeviceField.RPM,
      position: {
        lowByte: 3,
        highByte: 2,
        highByteMultiplier: 100,
        byte: [
          {
            index: 1,
            value: [
              {
                index: 1,
                value: 1,
              },
            ],
          },
        ],
      },
      value: 0,
    },
    [DeviceField.WATT]: {
      type: DeviceField.WATT,
      position: {
        lowByte: 9,
        highByte: 8,
        highByteMultiplier: 100,
        byte: [
          {
            index: 1,
            value: [
              {
                index: 1,
                value: 1,
              },
            ],
          },
        ],
      },
      value: 0,
    },
  };

  private restoredValues: Partial<
    Record<DeviceField | DeviceUniqueField, number>
  > = {};

  private NOTIIFCATION_INTERVAL = 1000;

  public onConnectionChange: OnConnectionChange;
  public onDataChange: OnDataChange;
  public onUniqueFieldChange: OnUniqueFieldChange;
  public onUniqueFieldChangeRequest: OnUniqueFieldChange;
  public onStartedChange: OnStartedChange;
  public onDeviceChoose: OnDeviceChoose;
  public onDisconnect: OnDisconnect;
  private dataInterval?: number;
  public isStarted: boolean;
  public isConnected: boolean = false;

  constructor(
    onConnectionChange: OnConnectionChange,
    onDataChange: OnDataChange,
    onUniqueFieldChange: OnUniqueFieldChange,
    onUniqueFieldChangeRequest: OnUniqueFieldChange,
    onStartedChange: OnStartedChange,
    onDeviceChoose: OnDeviceChoose,
    onDisconnect: OnDisconnect,
    availableDevices: IDevice[],
    isStarted: boolean = false,
    weight?: number,
  ) {
    this.availableBackendDevices = availableDevices;
    this.onConnectionChange = onConnectionChange;
    this.onDataChange = onDataChange;
    this.onUniqueFieldChange = onUniqueFieldChange;
    this.onUniqueFieldChangeRequest = onUniqueFieldChangeRequest;
    this.onStartedChange = onStartedChange;
    this.onDeviceChoose = onDeviceChoose;
    this.onDisconnect = onDisconnect;
    this.isStarted = isStarted;
    this.weight = weight;
  }

  private sendWorkoutData = () => {
    const baseData = [
      CharacteristicType.WORKOUT,
      this.isStarted ? 0x01 : 0x00,
      0x00,
      0x00,
    ];

    R.values(this.uniqueFields ?? {}).forEach(({set, value}) => {
      if (set) {
        baseData[set.byte] = value ?? 1;
      }
    });
    return this.sendData(baseData)?.catch((err) => {
      console.error('error', err);
      if (this.dataInterval) {
        clearInterval(this.dataInterval);
        this.dataInterval = undefined;
        this.disconnect();
      }
    });
  };

  private sendData = (data: number[]) => {
    if (!this.isConnected) {
      return;
    }
    if (!this.characteristic) {
      return;
    }
    if (!this.device) {
      return;
    }

    const payload = createByteArray(data);

    return this.characteristic.writeWithoutResponse(
      base64.fromByteArray(payload),
    );
  };

  public connect = async (device: Device) => {
    try {
      if (device.id === this.device?.id) {
        // if ids match - we need to disconnect the devices
        await this.disconnect();
      }
      console.log('this', this.availableBackendDevices);

      const backendDevice = this.availableBackendDevices.find(
        (availableDevice) => availableDevice.id === device.id,
      );

      if (!backendDevice) {
        throw new Error(`Device not found: ${device.id}`);
      }

      this.device = device;
      this.uniqueFields = {...backendDevice.uniqueFields};
      this.backendDevice = backendDevice;

      await this.device.connect();
      await this.device.requestConnectionPriority(ConnectionPriority.High);

      await this.device.discoverAllServicesAndCharacteristics();
      this.onDeviceChoose(backendDevice);

      const services = await this.device.services();

      const characteristics = await Promise.all(
        services.map((service) => service.characteristics()),
      );

      this.characteristic = R.flatten(characteristics).find(
        (characteristic) =>
          characteristic.uuid === this.backendDevice?.characteristicId,
      );

      this.onConnectedChange(true);

      device.onDisconnected(this.handleDisconnect);

      if (this.weight) {
        this.changeWeight(this.weight);
      }

      this.dataInterval = setInterval(
        this.sendWorkoutData.bind(this),
        this.NOTIIFCATION_INTERVAL,
      );

      this.characteristicListener = this.characteristic?.monitor(
        this.handleMonitor.bind(this),
      );
    } catch (error) {
      console.error('Connection failed', error);
    }
  };

  public handleDisconnect = () => {
    this.onConnectedChange(false);
  };

  public onConnectedChange = (isConnected: boolean) => {
    this.isConnected = isConnected;

    this.onConnectionChange(isConnected);
  };

  public disconnect = async () => {
    try {
      if (this.characteristicListener) {
        this.characteristicListener.remove();
      }
      if (this.disconnectListener) {
        this.disconnectListener.remove();
      }
      await this.device?.cancelConnection();
    } catch (error) {
      console.error('Disconnect failed');
    } finally {
      this.handleDisconnect();
      this.clearDevice();
      this.onDisconnect();
    }
  };

  private clearDevice = () => {
    this.device = undefined;
    this.backendDevice = undefined;
    this.uniqueFields = undefined;
  };

  private handleMonitor = (
    err: BleError | null,
    characteristic: Characteristic | null,
  ) => {
    if (err) {
      console.error('monitor', err);

      this.disconnect();

      return;
    }

    if (
      !characteristic ||
      !this.characteristic ||
      characteristic.id !== this.characteristic.id
    ) {
      console.error('Wrong notification');
      return;
    }

    if (!characteristic.value) {
      console.error('No value');
      return;
    }

    const characteristicArray = base64.toByteArray(characteristic.value);

    const newUniqueFields: Tuple<string, UniqueField>[] = Object.entries(
      this.uniqueFields ?? {},
    ).map(([id, uniqueField]) => [
      id,
      R.assoc(
        'value',
        this.getNewValue(
          characteristicArray,
          uniqueField.get,
          this.restoredValues[uniqueField.type],
        ),
        uniqueField,
      ),
    ]);

    newUniqueFields.forEach(([id, newUniqueField]) => {
      if (
        newUniqueField.value !== undefined &&
        newUniqueField.value !== this.uniqueFields?.[id]?.value
      ) {
        this.onUniqueFieldChangeRequest(id, newUniqueField.value);
      }
    });

    console.log(
      'characteristics',
      characteristicArray,
      newUniqueFields.map((a) => a[1].value),
    );

    this.DEVICE_FIELDS = R.mapObjIndexed(
      (field) =>
        R.assoc(
          'value',
          this.getNewValue(
            characteristicArray,
            field.position,
            this.restoredValues[field.type],
          ) ?? field.value,
          field,
        ),
      this.DEVICE_FIELDS,
    );

    this.onDataChange(Object.values(this.DEVICE_FIELDS));
  };

  private getNewValue = (
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

      console.log('n');

      // when device is paused - data is set to 0. When data is accumulative - we want to store previous value.
      return position.accumulative ? newValue + prevValue : newValue;
    }
    return undefined;
  };

  public changeWeight = (weight: number) => {
    this.weight = weight;

    this.sendData([
      CharacteristicType.WEIGHT,
      ...ByteNumber.toBytes(weight * LBS_IN_KG),
      weight,
    ]);
  };

  public changeStarted = (isStarted: boolean) => {
    if (!isStarted && this.isStarted) {
      this.restoredValues = pipe(
        [
          ...Object.values(this.DEVICE_FIELDS),
          ...Object.values(this.uniqueFields ?? {}),
        ],
        R.indexBy((obj) => obj.type),
        R.mapObjIndexed((data) => data.value ?? 0),
      );
    }
    this.isStarted = isStarted;
    this.onStartedChange(isStarted);
  };

  public changeUniqueField = (id: string, value: number) => {
    this.uniqueFields = R.assocPath([id, 'value'], value, this.uniqueFields);
    this.onUniqueFieldChange(id, value);
  };
}

class ByteNumber {
  static toLowerByte = (number: number) => number & 0xff;

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
}

declare function setInterval(
  handler: (...args: any[]) => void,
  timeout: number,
): number;
