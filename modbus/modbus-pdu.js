/**
 * Modbus PDU Library - Browser Compatible Version
 * Self-contained ES Module with Buffer dependency
 */

import { Buffer } from 'https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm';
window.Buffer = Buffer;

(function(global) {
    'use strict';
    
    // Buffer wrapper
    var Buff = {
        alloc: function(size) {
            return Buffer.alloc(size);
        },
        from: function(data, encoding) {
            return Buffer.from(data, encoding);
        }
    };
    
    // Exception module
    var Exception = {
        IllegalFunction: 0x01,
        IllegalDataAddress: 0x02,
        IllegalDataValue: 0x03,
        ServerDeviceFailure: 0x04,
        Aknowledge: 0x05,
        ServerDeviceBusy: 0x06,
        MemoryParityError: 0x08,
        GatewayPathUnavailable: 0x0A,
        GatewayTargetDeviceFailedToRespond: 0x0B,
        
        parse: function(buffer) {
            var code = buffer.readUInt8(0);
            var exception = buffer.readUInt8(1);
            
            var functionName = '';
            for (var k in Modbus) {
                if (typeof Modbus[k] === "object" && Modbus[k].Code === (code & 0x7F)) {
                    functionName = k;
                    break;
                }
            }
            
            var exceptionName = '';
            for (var e in Exception) {
                if (Exception[e] === exception && typeof Exception[e] === 'number') {
                    exceptionName = e;
                    break;
                }
            }
            
            return {
                code: functionName,
                exception: exceptionName
            };
        },
        
        build: function(fcode, exception) {
            var buffer = Buff.alloc(2);
            buffer.writeUInt8(fcode | 0x80, 0);
            buffer.writeUInt8(exception, 1);
            return buffer;
        },
        
        error: function(name) {
            var code = Exception[name];
            var err = new Error(name);
            err.code = code;
            return err;
        }
    };
    
    // Helpers module
    var Helpers = {
        buildStartEndAddress: function(start, end) {
            var buffer = Buff.alloc(4);
            buffer.writeUInt16BE(start, 0);
            buffer.writeUInt16BE(end - start + 1, 2);
            return buffer;
        },
        
        buildAddressQuantity: function(address, quantity) {
            var buffer = Buff.alloc(4);
            buffer.writeUInt16BE(address, 0);
            buffer.writeUInt16BE(quantity, 2);
            return buffer;
        },
        
        buildEmpty: function() {
            return Buff.alloc(0);
        },
        
        parseStartEndAddress: function(buffer) {
            if (buffer.length < 4) return null;
            return {
                start: buffer.readUInt16BE(0),
                end: buffer.readUInt16BE(0) + buffer.readUInt16BE(2) - 1
            };
        },
        
        parseAddressQuantity: function(buffer) {
            if (buffer.length < 4) return null;
            return {
                address: buffer.readUInt16BE(0),
                quantity: buffer.readUInt16BE(2)
            };
        },
        
        parseAddressValue: function(buffer) {
            if (buffer.length < 4) return null;
            return {
                address: buffer.readUInt16BE(0),
                value: buffer.slice(2, 4)
            };
        },
        
        parseEmpty: function() {
            return {};
        },
        
        numberToBuffer: function(number) {
            if (Buffer.isBuffer(number)) {
                return number;
            }
            var buffer = Buff.alloc(2);
            buffer.writeUInt16BE(number, 0);
            return buffer;
        },
        
        bitsToBuffer: function(bits) {
            if (bits == null || bits.length > 2040) {
                throw new Error("Buffer overflow, bit length is out of bounds");
            }
            
            var buffer = Buff.alloc(Math.ceil(bits.length / 8) + 1);
            var i;
            
            buffer.fill(0x00);
            buffer[0] = buffer.length - 1;
            
            for (var index = 0; index < bits.length; index++) {
                i = Math.floor(index / 8) + 1;
                buffer[i] >>= 1;
                if (bits[index]) {
                    buffer[i] |= 0x80;
                }
            }
            
            i = bits.length - (Math.floor(bits.length / 8) * 8);
            if (i > 0) {
                i = 8 - i;
                while (i > 0) {
                    buffer[buffer.length - 1] >>= 1;
                    i -= 1;
                }
            }
            
            return buffer;
        },
        
        blocksToBuffer: function(blocks) {
            if (Buffer.isBuffer(blocks)) {
                var buffer = Buff.alloc(blocks.length + 1);
                buffer[0] = blocks.length;
                blocks.copy(buffer, 1);
                return buffer;
            }
            
            var buffer = Buff.alloc((blocks.length * 2) + 1);
            buffer.writeUInt8(blocks.length * 2, 0);
            
            for (var i = 0; i < blocks.length; i++) {
                if (blocks[i].length < 2) {
                    buffer[(i * 2) + 1] = 0;
                    buffer[(i * 2) + 2] = 0;
                }
                blocks[i].copy(buffer, (i * 2) + 1, 0, 2);
            }
            
            return buffer;
        },
        
        bufferToBits: function(buffer) {
            var bits = [];
            for (var i = 1; i < Math.min(buffer.length, buffer[0] + 1); i++) {
                for (var j = 0; j < 8; j++) {
                    bits.push((buffer[i] & (1 << j)) ? 1 : 0);
                }
            }
            return bits;
        },
        
        bufferToBlocks: function(buffer) {
            if (buffer.length === 0) return null;
            var total = buffer.readUInt8(0) / 2;
            var blocks = [];
            for (var i = 0; i < total; i++) {
                blocks.push(Buff.from([buffer[(i * 2) + 1], buffer[(i * 2) + 2]]));
            }
            return blocks;
        },
        
        copyBufferBlocks: function(buffer, values, offset) {
            for (var i = 0; i < values.length; i++) {
                values[i].copy(buffer, offset + (i * 2), 0, 2);
            }
        }
    };
    
    // Protocol definitions
    var protocols = {
        ReadCoils: {
            code: 0x01,
            buildRequest: Helpers.buildAddressQuantity,
            parseRequest: Helpers.parseAddressQuantity,
            buildResponse: Helpers.bitsToBuffer,
            parseResponse: Helpers.bufferToBits
        },
        ReadDiscreteInputs: {
            code: 0x02,
            buildRequest: Helpers.buildAddressQuantity,
            parseRequest: Helpers.parseAddressQuantity,
            buildResponse: Helpers.bitsToBuffer,
            parseResponse: Helpers.bufferToBits
        },
        ReadHoldingRegisters: {
            code: 0x03,
            buildRequest: Helpers.buildAddressQuantity,
            parseRequest: Helpers.parseAddressQuantity,
            buildResponse: Helpers.blocksToBuffer,
            parseResponse: Helpers.bufferToBlocks
        },
        ReadInputRegisters: {
            code: 0x04,
            buildRequest: Helpers.buildAddressQuantity,
            parseRequest: Helpers.parseAddressQuantity,
            buildResponse: Helpers.blocksToBuffer,
            parseResponse: Helpers.bufferToBlocks
        },
        WriteSingleCoil: {
            code: 0x05,
            buildRequest: function(address, value) {
                var buffer = Buff.alloc(4);
                buffer.writeUInt16BE(address, 0);
                buffer.writeUInt16BE(value ? 0xFF00 : 0x0000, 2);
                return buffer;
            },
            parseRequest: function(buffer) {
                return {
                    address: buffer.readUInt16BE(0),
                    value: buffer.readUInt16BE(2) === 0xFF00
                };
            },
            buildResponse: function(address, value) {
                return this.buildRequest(address, value);
            },
            parseResponse: function(buffer) {
                return this.parseRequest(buffer);
            }
        },
        WriteSingleRegister: {
            code: 0x06,
            buildRequest: function(address, value) {
                var buffer = Buff.alloc(4);
                buffer.writeUInt16BE(address, 0);
                if (Buffer.isBuffer(value)) {
                    value.copy(buffer, 2, 0, 2);
                } else {
                    buffer.writeUInt16BE(value, 2);
                }
                return buffer;
            },
            parseRequest: Helpers.parseAddressValue,
            buildResponse: function(address, value) {
                return this.buildRequest(address, value);
            },
            parseResponse: Helpers.parseAddressValue
        },
        ReadExceptionStatus: {
            code: 0x07,
            buildRequest: Helpers.buildEmpty,
            parseRequest: Helpers.parseEmpty,
            buildResponse: function(status) {
                var buffer = Buff.alloc(1);
                buffer.writeUInt8(status, 0);
                return buffer;
            },
            parseResponse: function(buffer) {
                return { status: buffer.readUInt8(0) };
            }
        }
    };
    
    // Main Modbus object
    var Modbus = {
        Exception: Exception,
        
        Package: function(fcode, data) {
            var buffer = Buff.alloc(data.length + 1);
            buffer.writeUInt8(fcode, 0);
            Buff.from(data).copy(buffer, 1);
            return buffer;
        },
        
        Helpers: {
            blocksToBuffer: Helpers.blocksToBuffer,
            bitsToBuffer: Helpers.bitsToBuffer,
            bufferToBlocks: Helpers.bufferToBlocks,
            bufferToBits: Helpers.bufferToBits
        },
        
        Request: function(buffer) {
            var code = buffer.readUInt8(0);
            
            for (var k in Modbus) {
                if (typeof Modbus[k] === "object" && Modbus[k].Code === code) {
                    var data = Modbus[k].Request.parse(buffer);
                    
                    if (typeof data === "object" && !Array.isArray(data) && data !== null) {
                        data.code = k;
                    } else {
                        data = { code: k, data: data };
                    }
                    
                    return data;
                }
            }
            
            return {
                code: buffer[0],
                data: buffer.slice(1)
            };
        },
        
        Response: function(buffer) {
            var code = buffer.readUInt8(0);
            
            if (code & 0x80) {
                return Exception.parse(buffer);
            }
            
            for (var k in Modbus) {
                if (typeof Modbus[k] === "object" && Modbus[k].Code === code) {
                    var data = Modbus[k].Response.parse(buffer);
                    
                    if (typeof data === "object" && !Array.isArray(data) && data !== null) {
                        data.code = k;
                    } else {
                        data = { code: k, data: data };
                    }
                    
                    return data;
                }
            }
            
            return {
                code: buffer[0],
                data: buffer.slice(1)
            };
        }
    };
    
    // Add protocol functions to Modbus object
    for (var protocolName in protocols) {
        var protocol = protocols[protocolName];
        Modbus[protocolName] = {
            Code: protocol.code,
            Request: {
                build: function(funct) {
                    return function() {
                        var stream = funct.buildRequest.apply(funct, arguments);
                        var buffer = Buff.alloc(stream.length + 1);
                        buffer[0] = funct.code;
                        stream.copy(buffer, 1);
                        return buffer;
                    };
                }(protocol),
                parse: function(funct) {
                    return function(buffer) {
                        return funct.parseRequest(buffer.slice(1));
                    };
                }(protocol)
            },
            Response: {
                build: function(funct) {
                    return function() {
                        var stream = funct.buildResponse.apply(funct, arguments);
                        var buffer = Buff.alloc(stream.length + 1);
                        buffer[0] = funct.code;
                        stream.copy(buffer, 1);
                        return buffer;
                    };
                }(protocol),
                parse: function(funct) {
                    return function(buffer) {
                        return funct.parseResponse(buffer.slice(1));
                    };
                }(protocol)
            },
            Exception: {
                build: function(funct) {
                    return function(exception) {
                        return Exception.build(funct.code, exception);
                    };
                }(protocol)
            }
        };
    }
    
    // Export to global scope and as ES module
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Modbus;
    } else {
        global.Modbus = Modbus;
    }
    
    // Return Modbus for ES module export
    return Modbus;
    
})(typeof window !== 'undefined' ? window : this);

// ES Module export
export default Modbus;
