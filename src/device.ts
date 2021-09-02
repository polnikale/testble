import * as R from 'ramda';
import base64 from 'base64-js';
import {
  BleError,
  Characteristic,
  ConnectionPriority,
  Device,
  Subscription,
} from 'react-native-ble-plx';

export enum DeviceUniqueField {
  RESISTANCE = 'RESISTANCE',
  INCLINE = 'INCLINE',
  SPEED = 'SPEED',
}

export enum DeviceType {
  THREADMILL = 'THREADMILL',
  XBIKE = 'XBIKE',
}

enum CharacteristicType {
  WORKOUT = 0x20,
  WEIGHT = 0x40,
}

const LBS_IN_KG = 2.20462;

export interface IDevice {
  id: string;
  characteristicId: string;
  uniqueFields: DeviceUniqueField[];
  type: DeviceType;
  hasHeartRate?: boolean;
}

export interface IData {
  distance: number;
  calories: number;
  heartRate?: number;
  watt: number;
  rpm: number;
  speed: number;
}

interface Position {
  lowByte: number;
  highByte?: number;
  highByteMultiplier?: number;
  lowByteMultiplier?: number;
  byte?: BytePosition[];
}

interface BytePosition {
  index: number;
  value: number | BitPosition[];
}

interface BitPosition {
  index: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  value: 1 | 0;
}

// the last value is checksum
const createByteArray = (values: number[]) =>
  Uint8Array.from([...values, R.sum(values)]);

type OnConnectionChange = (isConnected: boolean) => void;
type OnStartedChange = (isStarted: boolean) => void;
type OnDataChange = (data: IData) => void;
type OnUniqueFieldChange = (resistance: number) => void;

export default class SPDevice {
  public device?: Device;
  private characteristic?: Characteristic;
  private characteristicListener?: Subscription;
  private disconnectListener?: Subscription;
  private backendDevice?: IDevice;
  private availableBackendDevices: IDevice[];

  private weight?: number;
  private heartRate = 0;
  private rpm = 0;
  private distance = 0;
  private calories = 0;
  private watt = 0;
  private speed = 0;

  private HEART_RATE_POSITION: Position = {
    lowByte: 8,
    byte: [
      {
        index: 1,
        value: 48,
      },
    ],
  };
  private UNIQUE_FIELD_POSITION: Position = {
    lowByte: 10,
    byte: [
      {
        index: 1,
        value: 112,
      },
      {index: 0, value: CharacteristicType.WORKOUT},
    ],
  };

  private DISTANCE_POSITION: Position = {
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
  };

  private CALORIES_POSITION: Position = {
    lowByte: 7,
    highByte: 6,
    highByteMultiplier: 100,
    byte: [
      {
        index: 1,
        value: 48,
      },
    ],
  };

  private SPEED_POSITION: Position = {
    lowByte: 3,
    lowByteMultiplier: 100,
    highByte: 2,
    highByteMultiplier: 10000,
    byte: [
      {
        index: 1,
        value: [
          {
            index: 1,
            value: 0,
          },
        ],
      },
    ],
  };

  private RPM_POSITION: Position = {
    lowByte: 3,
    highByte: 2,
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
  };

  public uniqueField?: number;

  public onConnectionChange: OnConnectionChange;
  public onDataChange: OnDataChange;
  public onUniqueFieldChange: OnUniqueFieldChange;
  public onUniqueFieldChangeRequest: OnUniqueFieldChange;
  public onStartedChange: OnStartedChange;
  private dataInterval?: number;
  public isStarted: boolean;
  public isConnected: boolean = false;

  constructor(
    onConnectionChange: OnConnectionChange,
    onDataChange: OnDataChange,
    onUniqueFieldChange: OnUniqueFieldChange,
    onUniqueFieldChangeRequest: OnUniqueFieldChange,
    onStartedChange: OnStartedChange,
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
    this.isStarted = isStarted;
    this.weight = weight;
  }

  private sendWorkoutData = () => {
    return this.sendData([
      CharacteristicType.WORKOUT,
      this.isStarted ? 0x01 : 0x00,
      this.uniqueField ?? 1,
      0x00,
    ])?.catch((err) => {
      console.error('error', err);
      if (this.dataInterval) {
        clearInterval(this.dataInterval);
        this.dataInterval = undefined;
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

      const backendDevice = this.availableBackendDevices.find(
        (availableDevice) => availableDevice.id === device.id,
      );

      if (!backendDevice) {
        throw new Error(`Device not found: ${device.id}`);
      }

      this.device = device;
      this.backendDevice = backendDevice;

      await this.device.connect();
      await this.device.requestConnectionPriority(ConnectionPriority.High);

      await this.device.discoverAllServicesAndCharacteristics();

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

      this.dataInterval = setInterval(this.sendWorkoutData.bind(this), 100);

      this.characteristicListener = this.characteristic?.monitor(
        this.handleMonitor.bind(this),
      );
    } catch (error) {
      console.error('Connection failed');
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
    }
    this.handleDisconnect();
    this.clearDevice();
  };

  private clearDevice = () => {
    this.device = undefined;
    this.backendDevice = undefined;
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

    const newUniqueField = this.getNewValue(
      characteristicArray,
      this.UNIQUE_FIELD_POSITION,
    );

    if (newUniqueField && newUniqueField !== this.uniqueField) {
      this.onUniqueFieldChangeRequest(newUniqueField);
    }
    console.log('characteristic', characteristicArray);

    this.heartRate =
      this.getNewValue(characteristicArray, this.HEART_RATE_POSITION) ??
      this.heartRate;

    this.distance =
      this.getNewValue(characteristicArray, this.DISTANCE_POSITION) ??
      this.distance;

    this.calories =
      this.getNewValue(characteristicArray, this.CALORIES_POSITION) ??
      this.calories;

    this.speed =
      this.getNewValue(characteristicArray, this.SPEED_POSITION) ?? this.speed;

    this.rpm =
      this.getNewValue(characteristicArray, this.RPM_POSITION) ?? this.rpm;

    console.log('valuesL', this.heartRate, this.distance, this.calories);

    this.onDataChange({
      heartRate: this.heartRate,
      distance: this.distance,
      calories: this.calories,
      watt: this.watt,
      rpm: this.rpm,
      speed: this.speed,
    });
  };

  private getNewValue = (characteristics: Uint8Array, position: Position) => {
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

      if (fullHigherValue + fullLowerValue === null) {
        console.log('NULL:', fullHigherValue + fullLowerValue);
      }

      return fullLowerValue + fullHigherValue;
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
    this.isStarted = isStarted;
    this.onStartedChange(isStarted);
  };

  public changeUniqueField = (uniqueField: number) => {
    this.uniqueField = uniqueField;
    this.onUniqueFieldChange(uniqueField);
  };
}

class ByteNumber {
  static toLowerByte = (number: number) => number & 0xff;

  static toHigherByte = (number: number) => (number >> 8) & 0xff;

  static toBytes = (number: number) => [
    this.toHigherByte(number),
    this.toLowerByte(number),
  ];

  static fromBytes = ([higherByte, lowerByte]: [number, number]) =>
    (higherByte << 8) | lowerByte;

  static to16 = (number = 0) => Number(Number(number).toString(16));
}

declare function setInterval(
  handler: (...args: any[]) => void,
  timeout: number,
): number;
