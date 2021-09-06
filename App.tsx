/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * Generated with the TypeScript template
 * https://github.com/react-native-community/react-native-template-typescript
 *
 * @format
 */

import React, {useState} from 'react';
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
import useBle from './src/hooks/useBle';

const App = () => {
  const {
    devices,
    currentDevice,
    data,
    isStarted,
    uniqueField,
    millisecondsSpent,
    connectDevice,
    disconnectDevice,
  } = useBle({started: false, weight: 70});
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
        {devices.map((device) => (
          <TouchableOpacity
            onPress={() =>
              currentDevice.current.device?.id === device.id
                ? connectDevice(device)
                : disconnectDevice()
            }>
            <Text style={{color: 'red', fontSize: 30}}>
              {device.name} -{' '}
              {device.id === currentDevice?.current.device?.id
                ? 'Connected'
                : 'Not'}
            </Text>
          </TouchableOpacity>
        ))}
        {data?.map((field) => (
          <Text style={{fontSize: 24, margin: 4}}>
            {field.type} - {field.value}
          </Text>
        ))}

        {Object.values(uniqueField ?? {}).map((field) => (
          <Text style={{fontSize: 24, margin: 4}}>
            {field.type} - {field.value || (field.set ? 1 : 0)}
          </Text>
        ))}
        <Text style={{fontSize: 24, margin: 4, marginTop: 16}}>
          Time spent - {millisecondsSpent / 1000}
        </Text>
        {uniqueField?.map(
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
                    currentDevice.current.changeUniqueField(field.type, +value)
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
          onValueChange={currentDevice.current.changeStarted}
        />

        <Button
          title="Disconnect"
          onPress={() => currentDevice.current.disconnect()}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export default App;
