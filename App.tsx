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
    toggleDevice,
    currentDevice,
    data,
    isStarted,
    uniqueField,
    millisecondsSpent,
  } = useBle();
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
          <TouchableOpacity onPress={() => toggleDevice(device)}>
            <Text style={{color: 'red', fontSize: 30}}>
              {device.name} -{' '}
              {device.id === currentDevice?.current.device?.id
                ? 'Connected'
                : 'Not'}
            </Text>
          </TouchableOpacity>
        ))}
        <Text>{JSON.stringify(data)}</Text>

        {Object.values(uniqueField ?? {}).map((field) => (
          <Text>
            {field.type} - {field.value}
          </Text>
        ))}
        <Text>Time spent - {millisecondsSpent / 1000}</Text>
        <Text>Please set incline</Text>
        {Object.entries(uniqueField ?? {}).map(
          ([id, field]) =>
            field.set && (
              <TextInput
                value={'' + (field.value ?? 1)}
                style={{backgroundColor: 'green', padding: 16}}
                onChangeText={(value) =>
                  currentDevice.current.changeUniqueField(id, +value)
                }
              />
            ),
        )}

        <Text style={{fontSize: 30}}>Please set started</Text>
        <Switch
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
