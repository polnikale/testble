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
  DEVICES_BY_BYTE,
  DeviceUniqueFieldType,
  LocalDevice,
  LOCAL_ID,
  OnConnectionChange,
  OnDataChange,
  OnDeviceChoose,
  OnDeviceFind,
  OnDisconnect,
  OnStartedChange,
  OnUniqueFieldChange,
  UniqueDeviceField,
} from './device.interface';
import deviceFields from './deviceFields';
import {getUpdatedFields, updateField} from './field';
import {ByteNumber, toLbs} from './mappers';

export const AVAILABLE_NAME = 'Cardiofit';

export default class SPDevice {
  public device?: Device;
  private characteristic?: Characteristic;

  private characteristicListener?: Subscription;
  private disconnectListener?: Subscription;
  private dataInterval?: number;

  private backendDevice?: BackendDevice;
  private availableBackendDevices: Record<
    LOCAL_ID,
    BackendDevice & LocalDevice
  >;

  private uniqueFields?: UniqueDeviceField[];
  private deviceFields = deviceFields;

  private restoredValues: Partial<
    Record<DeviceFieldType | DeviceUniqueFieldType, number>
  > = {};

  private NOTIIFCATION_INTERVAL = 1000;
  private AVAILABLE_SERVICE_ID = '0000fff1-0000-1000-8000-00805f9b34fb';

  public onConnectionChange: OnConnectionChange;
  public onDataChange: OnDataChange;
  public onUniqueFieldChange: OnUniqueFieldChange;
  public onUniqueFieldChangeRequest: OnUniqueFieldChange;
  public onStartedChange: OnStartedChange;
  public onDeviceChoose: OnDeviceChoose;
  public onDeviceFind: OnDeviceFind;
  public onDisconnect: OnDisconnect;

  public isStarted: boolean;
  public isConnected: boolean = false;

  private weight?: number;

  constructor({
    onConnectionChange,
    onDataChange,
    onUniqueFieldChange,
    onUniqueFieldChangeRequest,
    onStartedChange,
    onDeviceChoose,
    onDeviceFind,
    onDisconnect,
    availableDevices,
    isStarted = false,
    weight,
  }: {
    onConnectionChange: OnConnectionChange;
    onDataChange: OnDataChange;
    onUniqueFieldChange: OnUniqueFieldChange;
    onUniqueFieldChangeRequest: OnUniqueFieldChange;
    onStartedChange: OnStartedChange;
    onDeviceChoose: OnDeviceChoose;
    onDeviceFind: OnDeviceFind;
    onDisconnect: OnDisconnect;
    availableDevices: Record<LOCAL_ID, BackendDevice & LocalDevice>;
    isStarted?: boolean;
    weight?: number;
  }) {
    this.availableBackendDevices = availableDevices;

    this.onConnectionChange = onConnectionChange;
    this.onDataChange = onDataChange;
    this.onUniqueFieldChange = onUniqueFieldChange;
    this.onUniqueFieldChangeRequest = onUniqueFieldChangeRequest;
    this.onStartedChange = onStartedChange;
    this.onDeviceChoose = onDeviceChoose;
    this.onDeviceFind = onDeviceFind;
    this.onDisconnect = onDisconnect;

    this.isStarted = isStarted;
    this.weight = weight;
  }

  public connect = async (device: Device) => {
    try {
      await this.setupDevice(device);

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
      if (this.dataInterval) {
        clearInterval(this.dataInterval);
        this.dataInterval = undefined;
      }
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

  public changeWeight = (weight: number) => {
    this.weight = weight;

    this.sendData([
      CharacteristicType.INFO,
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

  public setAvailableDevices(
    availableDevices: Record<LOCAL_ID, BackendDevice & LocalDevice>,
  ) {
    this.availableBackendDevices = availableDevices;

    this.upateBackendDevice();
  }

  private upateBackendDevice = () => {
    if (!this.backendDevice && this.device) {
      const backendDevice = this.availableBackendDevices[this.device.id];
      if (backendDevice) {
        this.backendDevice = backendDevice;
        this.uniqueFields = Array.from(this.backendDevice.uniqueFields);
        this.onDeviceChoose(backendDevice, this.device);
      }
    }
  };

  private setupDevice = async (device: Device) => {
    try {
      if (device.id === this.device?.id) {
        // if ids match - we need to disconnect the devices
        await this.disconnect();
      }

      this.device = device;

      this.upateBackendDevice();

      await this.device.connect();
      await this.device.requestConnectionPriority(ConnectionPriority.High);

      await this.device.discoverAllServicesAndCharacteristics();

      const services = await this.device.services();

      const characteristics = await Promise.all(
        services.map((service) => service.characteristics()),
      );

      this.characteristic = pipe(characteristics, R.flatten, (arr) =>
        arr.find(R.propEq('uuid', this.AVAILABLE_SERVICE_ID)),
      );
    } catch (error) {
      console.error(`Setup failed ${error}`);
    }
  };

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

    this.processInfo(characteristicArray);
    this.processData(characteristicArray);
  };

  private processInfo = (characteristicArray: Uint8Array) => {
    if (characteristicArray[0] !== CharacteristicType.INFO) {
      return;
    }
    const deviceType = DEVICES_BY_BYTE[characteristicArray[2]];

    // if we have the backend device - it means we already understand what type of device it is. It means we're goodboys
    // in the other case - we need to take a look at the 1st field, find the device and add it.
    if (this.backendDevice || !this.device) {
      return;
    }

    if (deviceType) {
      this.onDeviceFind(this.device.id, deviceType);
    }
  };

  private processData = (characteristicArray: Uint8Array) => {
    if (characteristicArray.length <= 10) {
      return;
    }

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
      this.deviceFields.filter((deviceField) =>
        deviceField.type === DeviceFieldType.HEART_RATE
          ? this.backendDevice?.hasHeartRate
          : true,
      ),
    );
  };
}

declare function setInterval(
  handler: (...args: any[]) => void,
  timeout: number,
): number;
