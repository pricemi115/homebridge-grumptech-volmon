/* eslint-disable no-unused-vars */
/* eslint-disable indent */
/* eslint-disable brace-style */
/* eslint-disable semi */
/* eslint-disable new-cap */
import {VOLUME_TYPES, VolumeData, CONVERSION_BASES} from '../volumeData';

describe('Module-level tests', ()=>{
    test('Module VolumeData export expected value', ()=>{
        const volData = new VolumeData();
        expect(volData).toBeInstanceOf(VolumeData);
    });
    test('Module Enumerations export expected value', ()=>{
        expect(VOLUME_TYPES).toBeInstanceOf(Object);
        expect(CONVERSION_BASES).toBeInstanceOf(Object);
    });

    describe('Module VOLUME_TYPES expected value(s)', ()=>{
        test('VOLUME_TYPES size test', ()=>{
            expect(Object.values(VOLUME_TYPES).length).toBe(9);
        });
        describe.each([
            ['TYPE_UNKNOWN',    'TYPE_UNKNOWN',     'unknown'],
            ['TYPE_HFS_PLUS',   'TYPE_HFS_PLUS',    'hfs'],
            ['TYPE_APFS',       'TYPE_APFS',        'apfs'],
            ['TYPE_UDF',        'TYPE_UDF',         'udf'],
            ['TYPE_MSDOS',      'TYPE_MSDOS',       'msdos'],
            ['TYPE_NTFS',       'TYPE_NTFS',        'ntfs'],
            ['TYPE_SMBFS',      'TYPE_SMBFS',       'smbfs'],
            ['TYPE_EXT4',       'TYPE_EXT4',        'ext4'],
            ['TYPE_VFAT',       'TYPE_VFAT',        'vfat'],
        ])('Enumeration exists.', (desc, input, result) =>{
            test(desc, ()=>{
                expect(VOLUME_TYPES).toHaveProperty(input, result);
            });
        });
    });

    describe('Module CONVERSION_BASES expected value(s)', ()=>{
        test('CONVERSION_BASES size test', ()=>{
            expect(Object.values(CONVERSION_BASES).length).toBe(2);
        });
        describe.each([
            ['BASE_2',    'BASE_2',     2],
            ['BASE_10',   'BASE_10',    10],
        ])('Enumeration exists.', (desc, input, result) =>{
            test(desc, ()=>{
                expect(CONVERSION_BASES).toHaveProperty(input, result);
            });
        });
    });
});

describe('VolumeData class tests', ()=>{
    describe('Static function tests', ()=>{
        describe('Function ConvertFromBytesToGB()', ()=>{
            test('Function exists.', ()=>{
                expect(VolumeData.ConvertFromBytesToGB).toBeInstanceOf(Function);
            });
            describe.each([
                ['Base2 (0GB)',         CONVERSION_BASES.BASE_2,    0,                      0],
                ['Base2 (1GB)',         CONVERSION_BASES.BASE_2,    (1*1024*1024*1024),     1],
                ['Base2 (2GB)',         CONVERSION_BASES.BASE_2,    (2*1024*1024*1024),     2],
                ['Base2 (100MB)',       CONVERSION_BASES.BASE_2,    (100*1024*1024),        0.09765625],
                ['Base2 (-1GB)',        CONVERSION_BASES.BASE_2,    (-1*1024*1024*1024),    -1],
                ['Base10 (0GB)',        CONVERSION_BASES.BASE_10,   0,                      0],
                ['Base10 (1GB)',        CONVERSION_BASES.BASE_10,   1000000000,             1],
                ['Base10 (2GB)',        CONVERSION_BASES.BASE_10,   2000000000,             2],
                ['Base10 (100MB)',      CONVERSION_BASES.BASE_10,   100000000,              0.1],
                ['Base10 (-1GB)',       CONVERSION_BASES.BASE_10,   -1000000000,            -1],
                ['Default Base (1GB)',  undefined,                  (1*1024*1024*1024),     1],
            ])('Valid Data', (desc, base, bytes, result)=>{
                test(desc, ()=>{
                    expect(VolumeData.ConvertFromBytesToGB(bytes, base)).toBe(result);
                });
            });
            describe.each([
                ['Bytes - Undefined',   CONVERSION_BASES.BASE_2,    undefined,          TypeError],
                ['Bytes - Type',        CONVERSION_BASES.BASE_2,    'pancakes',         TypeError],
                ['Base - Value',        42,                         (1*1024*1024*1024), RangeError],
                ['Base - Type',         'waffles',                  (1*1024*1024*1024), RangeError],
            ])('Invalid Data', (desc, base, bytes, result)=>{
                test(desc, ()=>{
                    expect(()=>{VolumeData.ConvertFromBytesToGB(bytes, base)}).toThrow(result);
                });
            });
        });
        describe('Function ConvertFrom1KBlockaToBytes()', ()=>{
            test('Function exists.', ()=>{
                expect(VolumeData.ConvertFrom1KBlockaToBytes).toBeInstanceOf(Function);
            });
            describe.each([
                ['1000 blocks', 1000,   1024000],
                ['1 block',     1,      1024],
                ['0 blocks',    0,      0],
            ])('Valid Data', (desc, blocks, result)=>{
                test(desc, ()=>{
                    expect(VolumeData.ConvertFrom1KBlockaToBytes(blocks)).toBe(result);
                });
            });
            describe.each([
                ['Undefined',       undefined,  TypeError],
                ['Blocks Type',     'pancakes', TypeError],
                ['Negative blocks', -5,         RangeError],
            ])('Invalid Data', (desc, blocks, result)=>{
                test(desc, ()=>{
                    expect(()=>{VolumeData.ConvertFrom1KBlockaToBytes(blocks)}).toThrow(result);
                });
            });
        });
    });
    describe('Instance function/property valid tests', ()=>{
        let volData;
        let validData;
        beforeAll(()=>{
            validData = {name: 'pancakes',
                         disk_id: 'ABCD123',
                         volume_type: VOLUME_TYPES.TYPE_APFS,
                         mount_point: '/Volumes',
                         device_node: '/dev/dev123',
                         volume_uuid: '6BE31ECF-D516-4893-B9C2-12EFB1FA5546',
                         capacity_bytes: (5*(1024*1024*1024)),
                         free_space_bytes: (1024*1024*1024),
                         used_space: (4*(1024*1024*1024)),
                         visble: true,
                         shown: true,
                         low_space_alert: false,
            };
            volData     = new VolumeData(validData);
        });

        test('Name', ()=>{
            expect(volData).toHaveProperty('Name');
            expect(volData.Name).toBe(validData.name);
        });
        test('DiskId', ()=>{
            expect(volData).toHaveProperty('DiskId');
            expect(volData.DiskId).toBe(validData.disk_id);
        });
        test('VolumeType', ()=>{
            expect(volData).toHaveProperty('VolumeType');
            expect(volData.VolumeType).toBe(validData.volume_type);
        });
        test('MountPoint', ()=>{
            expect(volData).toHaveProperty('MountPoint');
            expect(volData.MountPoint).toBe(validData.mount_point);
        });
        test('DeviceNode', ()=>{
            expect(volData).toHaveProperty('DeviceNode');
            expect(volData.DeviceNode).toBe(validData.device_node);
        });
        test('VolumeUUID', ()=>{
            expect(volData).toHaveProperty('VolumeUUID');
            expect(volData.VolumeUUID).toBe(validData.volume_uuid);
        });
        test('Size', ()=>{
            expect(volData).toHaveProperty('Size');
            expect(volData.Size).toBe(validData.capacity_bytes);
        });
        test('FreeSpace', ()=>{
            expect(volData).toHaveProperty('FreeSpace');
            expect(volData.FreeSpace).toBe(validData.free_space_bytes);
        });
        test('UsedSpace', ()=>{
            expect(volData).toHaveProperty('UsedSpace');
            expect(volData.UsedSpace).toBe(validData.used_space);
        });
        test('IsMounted', ()=>{
            expect(volData).toHaveProperty('IsMounted');
            expect(volData.IsMounted).toBe(volData.MountPoint.length > 0);
        });
        test('IsVisible', ()=>{
            expect(volData).toHaveProperty('IsVisible');
            expect(volData.IsMounted).toBe(validData.visble);
        });
        test('LowSpaceAlert', ()=>{
            expect(volData).toHaveProperty('LowSpaceAlert');
            expect(volData.LowSpaceAlert).toBe(validData.low_space_alert);
        });
        test('PercentFree', ()=>{
            expect(volData).toHaveProperty('PercentFree');
            expect(volData.PercentFree).toBe((validData.free_space_bytes/validData.capacity_bytes)*100.0);
        });
        test('IsShown', ()=>{
            expect(volData).toHaveProperty('IsShown');
            expect(volData.IsShown).toBe(validData.shown);
        });
        test('IsMatch', ()=>{
            const altData =   {name: 'pancakes',
                               volume_type: VOLUME_TYPES.TYPE_APFS,
                               mount_point: '/Volumes',
                               device_node: '/dev/dev123',
                              };
            const altData2 =  {name: 'pancakes',
                               volume_type: VOLUME_TYPES.TYPE_APFS,
                               mount_point: '/Volumes',
                               device_node: '/dev/dev456',
                              };
            const volData2    = new VolumeData(altData);
            const volData3    = new VolumeData(altData2);
            expect(volData).toHaveProperty('IsMatch');
            expect(volData.IsMatch(volData2)).toBe(true);
            expect(volData.IsMatch(volData3)).toBe(false);
        });
    });
    describe('Instance function/property valid tests - part 2', ()=>{
        test('Negative computed used space', ()=>{
            const data =   {used_space_bytes: 5000,
                            capacity_bytes: 1000,
                            free_space_bytes: 10000,
                           };
            const volData = new VolumeData(data);
            expect(volData.UsedSpace).toBe(data.used_space_bytes);
        });
    });
    describe('Instance function/property invalid tests', ()=>{
        test('Invalid config arg', ()=>{
            expect(()=>{const volData = new VolumeData('waffles');}).toThrow(TypeError);
        });
        test('Invalid volume type', ()=>{
            const data =   {volume_type: 'waffles',
                           };
            expect(()=>{const volData = new VolumeData(data);}).toThrow(RangeError);
        });
        test('Negative capacity', ()=>{
            const data =   {capacity_bytes: -100,
                           };
            expect(()=>{const volData = new VolumeData(data);}).toThrow(RangeError);
        });
        test('Negative free space', ()=>{
            const data =   {free_space_bytes: -100,
                           };
            expect(()=>{const volData = new VolumeData(data);}).toThrow(RangeError);
        });
        test('Negative used space', ()=>{
            const data =   {used_space_bytes: -100,
                           };
            expect(()=>{const volData = new VolumeData(data);}).toThrow(RangeError);
        });
        test('Negative computed used space', ()=>{
            const data =   {used_space_bytes: undefined,
                            capacity_bytes: 1000,
                            free_space_bytes: 10000,
                           };
            expect(()=>{const volData = new VolumeData(data);}).toThrow(RangeError);
        });
    });
});
