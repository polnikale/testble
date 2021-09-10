/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * Generated with the TypeScript template
 * https://github.com/react-native-community/react-native-template-typescript
 *
 * @format
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import {Colors} from 'react-native/Libraries/NewAppScreen';
import {
  DeviceUniqueFieldType,
  OnUniqueFieldChange,
} from './src/device.interface';
import useBle from './src/useBle';
interface UniqueFieldChangeRequest {
  type: DeviceUniqueFieldType;
  value: number;
}

const TEST_BLE = () => {
  const [uniqueFieldChangeRequest, setUniqueFieldChangeRequest] =
    useState<UniqueFieldChangeRequest>();

  const onUniqueFieldChangeRequest = useCallback<OnUniqueFieldChange>(
    (type, value) => setUniqueFieldChangeRequest({type, value}),
    [],
  );

  const {
    devices,
    bleDevice,
    commonFields,
    isStarted,
    uniqueFields,
    millisecondsSpent,
    connectDevice,
    changeStarted,
    changeUniqueField,
    disconnectDevice,
  } = useBle({
    started: false,
    weight: 70,
    onUniqueFieldChangeRequest,
  });

  useEffect(() => {
    if (uniqueFieldChangeRequest) {
      const {type, value} = uniqueFieldChangeRequest;

      setUniqueFieldChangeRequest(undefined);
      changeUniqueField(type, value);
      return;
    }
  }, [changeUniqueField, uniqueFieldChangeRequest]);
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={backgroundStyle}>
        {devices.map((dev) => (
          <TouchableOpacity
            onPress={() =>
              bleDevice?.id === dev.id ? disconnectDevice() : connectDevice(dev)
            }>
            <Text style={{color: 'red', fontSize: 30}}>
              {dev.name} - {dev.id === bleDevice?.id ? 'Connected' : 'Not'}
            </Text>
          </TouchableOpacity>
        ))}
        {commonFields?.map((field) => (
          <Text style={{fontSize: 24, margin: 4}}>
            {field.type} - {field.value}
          </Text>
        ))}

        {uniqueFields?.map((field) => (
          <Text style={{fontSize: 24, margin: 4}}>
            {field.type} - {field.value || (field.set ? 1 : 0)}
          </Text>
        ))}
        <Text style={{fontSize: 24, margin: 4, marginTop: 16}}>
          Time spent - {millisecondsSpent / 1000}
        </Text>
        {uniqueFields?.map(
          (field) =>
            field.set && (
              <>
                <Text style={{fontSize: 18, margin: 4, marginTop: 16}}>
                  Please set resistance
                </Text>
                <TextInput
                  value={'' + (field.value || 1)}
                  style={{backgroundColor: 'green', padding: 16}}
                  onChangeText={(value) =>
                    changeUniqueField(field.type, +value)
                  }
                />
              </>
            ),
        )}

        <Text style={{fontSize: 30, margin: 4, marginTop: 16}}>
          Please set started
        </Text>
        <Switch
          style={{marginBottom: 100, marginLeft: 4}}
          value={isStarted}
          onValueChange={changeStarted}
        />

        <Button title="Disconnect" onPress={disconnectDevice} />
      </ScrollView>
    </SafeAreaView>
  );
};

export default TEST_BLE;
