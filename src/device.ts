import base64 from 'base64-js';
import {pipe} from 'fp-ts/lib/function';
import * as R from 'ramda';
import {
  BleError,
  Characteristic,
  ConnectionPriority,
  Device,
  Subscription,
} from 'react-native-ble-plx';
import {
  BackendDevice,
  CharacteristicType,
  DeviceFieldType,
  DeviceUniqueFieldType,
  OnConnectionChange,
  OnDataChange,
  OnDeviceChoose,
  OnDisconnect,
  OnStartedChange,
  OnUniqueFieldChange,
  UniqueDeviceField,
} from './device.interface';
import deviceFields from './deviceFields';
import {getUpdatedFields, updateField} from './utils/field';
import {ByteNumber, toLbs} from './utils/mappers';

export default class SPDevice {
  public device?: Device;
  private characteristic?: Characteristic;
  private characteristicListener?: Subscription;
  private disconnectListener?: Subscription;
  private backendDevice?: BackendDevice;
  private availableBackendDevices: BackendDevice[];

  private weight?: number;

  private uniqueFields?: UniqueDeviceField[];
  private deviceFields = deviceFields;

  private restoredValues: Partial<
    Record<DeviceFieldType | DeviceUniqueFieldType, number>
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
    availableDevices: BackendDevice[],
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

  public setAvailableDevices(availableDevices: BackendDevice[]) {
    this.availableBackendDevices = availableDevices;
  }

  private sendWorkoutData = () => {
    const baseData = [
      CharacteristicType.WORKOUT,
      this.isStarted ? 0x01 : 0x00,
      0x00,
      0x00,
    ];

    if (this.uniqueFields) {
      this.uniqueFields.forEach(({set, value}) => {
        if (set) {
          baseData[set.byte] = value ?? 1;
        }
      });
    }

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

    const payload = ByteNumber.createByteArray(data);

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
      this.uniqueFields = [...backendDevice.uniqueFields];
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

    if (this.uniqueFields) {
      const newUniqueFields = getUpdatedFields(
        this.uniqueFields,
        this.restoredValues,
        characteristicArray,
      );

      newUniqueFields.forEach((newUniqueField, index) => {
        if (
          newUniqueField.value !== undefined &&
          newUniqueField.value !== this.uniqueFields?.[index]?.value
        ) {
          this.onUniqueFieldChangeRequest(
            newUniqueField.type,
            newUniqueField.value,
          );
        }
      });
    }

    this.deviceFields = getUpdatedFields(
      this.deviceFields,
      this.restoredValues,
      characteristicArray,
    );

    this.onDataChange(
      pipe(
        this.deviceFields,
        R.reject(
          R.ifElse(
            R.propEq('type', DeviceFieldType.HEART_RATE),
            R.always(this.backendDevice?.hasHeartRate ?? false),
            R.always(false),
          ),
        ),
      ),
    );
  };

  public changeWeight = (weight: number) => {
    this.weight = weight;

    this.sendData([
      CharacteristicType.WEIGHT,
      ...ByteNumber.toBytes(toLbs(weight)),
      weight,
    ]);
  };

  public changeStarted = (isStarted: boolean) => {
    if (!isStarted && this.isStarted) {
      this.restoredValues = pipe(
        R.concat(this.deviceFields, this.uniqueFields ?? []),
        // R.prop is not typed correctly :(
        R.indexBy((obj) => obj.type),
        R.mapObjIndexed((data) => data.value ?? 0),
      );
    }
    this.isStarted = isStarted;
    this.onStartedChange(isStarted);
  };

  public changeUniqueField = (type: DeviceUniqueFieldType, value: number) => {
    this.uniqueFields = pipe(
      this.uniqueFields ?? [],
      R.map(updateField(value, type)),
    );
    this.onUniqueFieldChange(type, value);
  };
}

declare function setInterval(
  handler: (...args: any[]) => void,
  timeout: number,
): number;
