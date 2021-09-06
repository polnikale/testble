import {AuxiliaryDeviceField, DeviceFieldType} from './device.interface';

export default [
  {
    type: DeviceFieldType.HEART_RATE,
    get: {
      lowByte: 8,
      byte: [
        {
          index: 1,
          value: 48,
        },
      ],
    },
    isDecimal: true,
    value: 0,
  },
  {
    type: DeviceFieldType.DISTANCE,
    get: {
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
  {
    type: DeviceFieldType.CALORIES,
    get: {
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
  {
    type: DeviceFieldType.RPM,
    get: {
      lowByte: 3,
      highByte: 2,
      highByteMultiplier: 100,
      byte: [
        {
          index: 1,
          value: [
            {
              index: 4,
              value: 1,
            },
            {
              index: 6,
              value: 0,
            },
          ],
        },
      ],
    },
    value: 0,
  },
  // {
  //   type: DeviceFieldType.WATT,
  //   get: {
  //     lowByte: 9,
  //     highByte: 8,
  //     highByteMultiplier: 100,
  //     byte: [
  //       {
  //         index: 1,
  //         value: [
  //           {
  //             index: 6,
  //             value: 1,
  //           },
  //         ],
  //       },
  //     ],
  //   },
  //   value: 0,
  // },
] as AuxiliaryDeviceField[];
