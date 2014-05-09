(function(exports) {
  function pad(string) {
    return ("00" + string.toString()).slice(-2);
  }

  function read16(bits, offs) {
    return bits[offs] | bits[offs + 1] * 256;
  }

  function read32(bits, offs) {
    return  bits[offs] | (bits[offs + 1] <<8) | 
            (bits[offs + 2] <<16) | (bits[offs + 3] <<24);
  }

  function readBCDDate(bits, offs) {
    var rv = "";
    for (var k = 0; k< 8; k++) 
      rv += pad(bits[offs + k].toString(16));

    return rv;
  }

  function readText(bits, offs, count) {
    var rv = [];

    for (var k = 0; k< count; k++) 
      rv.push(bits[offs + k]);

    return shiftjisToString(rv).trim();
  }

  function readString(bits, offs, count) {
    var rv = [];

    for (var k = 0; k< count && (bits[offs + k] || bits[offs + k+1]); k++) 
      rv.push(bits[offs + k]);

    return shiftjisToString(rv).trim();
  }

  function getBlock(bits, block, count) {
    count = count || 1;
    return bits.subarray(block * 512, block * 512 + count*512);
  }

  function followFAT(vmu, block) {
    
    var fat = vmu.fat;
    var rv = [];

    do {
      //can't do loops
      if ($.inArray(block, rv) != -1)
        return false;

      rv.push(block);
      block = read16(fat, block * 2)
    } while(block < 256);

    return rv;
  }

  function getFileData(vmu, file) {
    var blocks = file.blocks;

    var rv = new Uint8Array(blocks.length * 512);

    for (var i = 0; i< blocks.length; i++) {
      rv.set(getBlock(vmu.bits, blocks[i]), i * 512);
    }

    return rv;
  }

  function parseIcon(file) {

  }

  function parseVMS(file) {
    var vms = {};
    var bits = file.data;

    vms.shortDescription = readText(bits, 0x0, 16);
    vms.description = readText(bits, 0x10, 32);

    vms.createdBy = readString(bits, 0x30, 32);
    //vms.createdByFull = readText(bits, 0x30, 32);

    vms.iconCount = read16(bits, 0x40);
    vms.iconAnimationSpeed = read16(bits, 0x42);

    vms.eyecatchType = read16(bits, 0x44);

    vms.crc = read16(bits, 0x46);

    vms.payloadSize = read32(bits, 0x48);

    var iconPalette = [];

    for (var i = 0; i<16; i++) {
      iconPalette.push(read16(bits, 0x60 + i*2));
    }

    var icons = vms.icons = [];

    var base = 0x80;

    for (var c = 0; c<vms.iconCount; c++) {
      var icon = [];
      icons.push(icon);

      icon.width = 32;
      icon.height = 32;
      icon.toCanvas = renderIcon;

      for (var i = 0; i<512; i++) {
        var pixels = bits[base];

        icon.push(iconPalette[(pixels>>4) & 0xF]);

        icon.push(iconPalette[pixels & 0xF]);

        base++;
      }
    }

    if (vms.eyecatchType) {
      
      var eyecatch = vms.eyecatch = [];
      eyecatch.width = 72;
      eyecatch.height = 56;
      eyecatch.toCanvas = renderIcon;

      switch(vms.eyecatchType) {
        case 1:
          for (var i = 0; i<4032; i++) {
            eyecatch.push(read16(bits, base + i*2));
          }
          base += i *2;
        break;

        case 2:
          var palette = [];
          for (var i = 0; i<256; i++) {
            palette.push(read16(bits, base + i*2));
          }

          base += i*2;

          for (var i = 0; i<4032; i++) {
            eyecatch.push(palette[bits[i]]);
          }

          base += i*2;
          break;

        case 3:
          var palette = [];
          for (var i = 0; i<16; i++) {
            palette.push(read16(bits, base + i*2));
          }

          base += i*2;

          for (var i = 0; i<2016; i++) {
            var pixels = bits[base];

            eyecatch.push(palette[pixels & 0xF]);
            eyecatch.push(palette[(pixels>>4) & 0xF]);

            base++;
          }
          break;
      }
    }

    return vms;
  }

  function parseFile(vmu, bits) {
    if (bits[0]) {
        var file = {};
        file.type = bits[0] == 0x33 ? "data" : "game";
        file.copyProtect = bits[1] == 0xff;
        file.firstBlock = read16(bits, 2);
        
        file.name = "";
        for (var k = 0x4; k<= 0xf; k++) 
          file.name += String.fromCharCode(bits[k]);

        file.timestamp = readBCDDate(bits, 0x10);
        file.size = read16(bits, 0x18) * 512;
        file.headerOffset = read16(bits, 0x1a);
        file.extra = Array.prototype.join.call(bits.subarray(0x1c, 0x20), " ");


        file.blocks = followFAT(vmu, file.firstBlock);
        file.data = getFileData(vmu, file);

        file.vms = parseVMS(file);

        return file;
      }
      else
        return false;
  }

  function parseVMU(file, callback) {

      var parse = 
      function(e) {
        
        if (e.byteLength != 128*1024) {
          callback(false);
          return;
        }

        var vmu = {}
        var bits = vmu.bits = new Uint8Array(e);
        
        vmu.fat = getBlock(bits, 254);

        var hash = "";
        for (var i =0x15; i<=0x3f;i++) {
          hash += pad(bits[255*512 + i].toString(16));
        }
        vmu.hash = sha1Hash(hash);
        vmu.color = [128, 128, 128, 255];
        
        if (bits[255*512 + 0x10]) {
          vmu.color =  [ bits[255*512 + 0x11],  bits[255*512 + 0x12], bits[255*512 + 0x13],  bits[255*512 + 0x14] ];
        }

        var files = vmu.files = [];
        
        for (var i = 253; i>=241; i--) {
          for (var j=0; j<(512/32); j++) {
            var file = parseFile(vmu, bits.subarray(i * 512 + j* 32,i * 512 + j* 32 + 32));

            file && files.push(file);
          }
        }
        
        callback(vmu);
      };

      if (file instanceof File) {
        var reader = new FileReader();
        
        reader.onload = function(e) { parse(e.target.result)}
        // Read in the image file as a data URL.
        reader.readAsArrayBuffer(file)
      } else if (file instanceof ArrayBuffer) {
        parse(file);
      } else {
        callback(false);
      }
  }

  function renderIcon(mag, canvas) {
    var icon = this;

    var canvas = canvas || $("<canvas>")[0];
    mag = mag || 1;

    var w = icon.width;
    var h = icon.height;

    canvas.width = w*mag;
    canvas.height = h*mag;

    var ctx = canvas.getContext("2d");

    for (var x = 0; x<w; x++) {
      for (var y = 0; y<h; y++) {
        ctx.fillStyle = "#" + ("000" +  icon[x + y * w].toString(16)).slice(-3);

        ctx.fillRect(x*mag,y*mag,mag,mag);
      }            
    }

    return $(canvas);
  }

  exports.parseVMU = parseVMU;
})(window);