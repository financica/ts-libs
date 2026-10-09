import { crc32 } from "node:zlib";

/**
 * A ZIP archive holding one file, stored uncompressed. Intervat takes a
 * declaration only as a ZIP, and one small XML file does not earn a
 * compression dependency.
 */
export function zipSingleFile(name: string, content: string | Uint8Array): Uint8Array {
	const nameBytes = Buffer.from(name, "utf8");
	const data = typeof content === "string" ? Buffer.from(content, "utf8") : content;
	const checksum = crc32(data);

	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0); // local file header
	local.writeUInt16LE(20, 4); // version needed
	local.writeUInt16LE(0x0800, 6); // flags: UTF-8 name
	local.writeUInt16LE(0, 8); // method: stored
	local.writeUInt32LE(checksum, 14);
	local.writeUInt32LE(data.length, 18); // compressed size
	local.writeUInt32LE(data.length, 22); // uncompressed size
	local.writeUInt16LE(nameBytes.length, 26);

	const central = Buffer.alloc(46);
	central.writeUInt32LE(0x02014b50, 0); // central directory header
	central.writeUInt16LE(20, 4); // version made by
	central.writeUInt16LE(20, 6); // version needed
	central.writeUInt16LE(0x0800, 8);
	central.writeUInt32LE(checksum, 16);
	central.writeUInt32LE(data.length, 20);
	central.writeUInt32LE(data.length, 24);
	central.writeUInt16LE(nameBytes.length, 28);
	// offset of the local header is 0

	const centralSize = central.length + nameBytes.length;
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0); // end of central directory
	end.writeUInt16LE(1, 8); // entries on this disk
	end.writeUInt16LE(1, 10); // entries in total
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(local.length + nameBytes.length + data.length, 16);

	return Buffer.concat([local, nameBytes, data, central, nameBytes, end]);
}
