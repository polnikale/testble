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
  pulse?: number;
  watt: number;
  uniqueFields: number[];
}

// the last value is checksum
const createByteArray = (values: number[]) =>
  Uint8Array.from([...values, R.sum(values)]);

type OnConnectionChange = (isConnected: boolean) => void;
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

  private HEART_RATE_INDEX = 8;

  private uniqueField?: number;

  private onConnectionChange: OnConnectionChange;
  private onDataChange: OnDataChange;
  private onUniqueFieldChange: OnUniqueFieldChange;
  private dataInterval?: number;
  private isStarted: boolean;
  public isConnected: boolean = false;

  constructor(
    onConnectionChange: OnConnectionChange,
    onDataChange: OnDataChange,
    onUniqueFieldChange: OnUniqueFieldChange,
    availableDevices: IDevice[],
    isStarted: boolean = false,
    weight?: number,
  ) {
    this.availableBackendDevices = availableDevices;
    this.onConnectionChange = onConnectionChange;
    this.onDataChange = onDataChange;
    this.onUniqueFieldChange = onUniqueFieldChange;
    this.isStarted = isStarted;
    this.weight = weight;
  }

  private sendWorkoutData = () => {
    return this.sendData([
      CharacteristicType.WORKOUT,
      this.isStarted ? 0x01 : 0x00,
      this.uniqueField ?? 0,
      0x00,
    ]).catch((err) => {
      console.error('error', err);
      if (this.dataInterval) {
        clearInterval(this.dataInterval);
        this.dataInterval = undefined;
      }
    });
  };

  private sendData = (data: number[]) => {
    if (!this.isConnected) {
      return Promise.reject();
    }
    if (!this.characteristic) {
      return Promise.reject();
    }
    if (!this.device) {
      return Promise.reject();
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

      this.dataInterval = setInterval(this.sendWorkoutData.bind(this), 50);

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
    if (this.characteristicListener) {
      this.characteristicListener.remove();
    }

    if (this.disconnectListener) {
      this.disconnectListener.remove();
    }
    await this.device?.cancelConnection();
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

      return;
    }
    // 2 options here:
    // 1: [32, UNKNOWN, UNKNWON, UNKNOWN, CHECKSUM]
    // 2: [32, StatusByte, Speed-H/ Counts-H/ rpm-H, Speed-L/Counts-L/ rpm-L, Distance H, Distance L, Calories-H, Calories-L, PulseWattH / Status2, WattL/Incline]
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

    if (characteristicArray.length > 4) {
      // UNKNOWN CASE
    } else {
      this.onDataChange({
        heartRate: characteristicArray[this.HEART_RATE_INDEX],
        distance: 0,
        calories: 0,
        watt: 0,
        uniqueFields: [],
      });
    }
  };

  public changeWeight = (weight: number) => {
    this.weight = weight;

    this.sendData([
      CharacteristicType.WEIGHT,
      ...ByteNumber.toBytes(weight * LBS_IN_KG),
      weight,
    ]);
  };

  public changeUniqueField = (uniqueField: number) => {
    this.uniqueField = uniqueField;
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
}

declare function setInterval(
  handler: (...args: any[]) => void,
  timeout: number,
): number;
