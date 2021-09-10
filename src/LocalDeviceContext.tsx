import React, {
  createContext,
  FC,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import {usePersistStorage} from 'react-native-use-persist-storage';
import {LOCAL_ID, BackendDevice, LocalDevice} from './device.interface';

type LocalDeviceRecord = Record<LOCAL_ID, BackendDevice & LocalDevice>;
type OnAddLocalDevice = (localId: LOCAL_ID, device: BackendDevice) => void;

export type LocalDeviceContextType = {
  localDevices: LocalDeviceRecord;
  onLocalDeviceAdd: OnAddLocalDevice;
  restoredLocalDevices: boolean;
};

const LocalDeviceContext = createContext<LocalDeviceContextType | null>(null);

export const useLocalDeviceContext = () => {
  const localDeviceContext = useContext(LocalDeviceContext);

  if (localDeviceContext === null) {
    throw new Error(
      'Local Device context cannot be null, please add a context provider.',
    );
  }
  return localDeviceContext as LocalDeviceContextType;
};

const LOCAL_DEVICE_KEY = '@localDevice';

export const LocalDeviceContextProvider: FC<PropsWithChildren<{}>> = ({
  children,
}) => {
  const [localDevices, setLocalDevices, restoredLocalDevices] =
    usePersistStorage<LocalDeviceRecord>(LOCAL_DEVICE_KEY, {});

  const onLocalDeviceAdd = useCallback<OnAddLocalDevice>(
    (localId, device) => {
      setLocalDevices((localDevices) => ({
        ...localDevices,
        [localId]: {
          ...device,
          localId,
        },
      }));
    },
    [setLocalDevices],
  );

  const value = useMemo(
    () => ({
      localDevices,
      onLocalDeviceAdd,
      restoredLocalDevices,
    }),
    [localDevices, onLocalDeviceAdd, restoredLocalDevices],
  );

  return (
    <LocalDeviceContext.Provider value={value}>
      {children}
    </LocalDeviceContext.Provider>
  );
};
