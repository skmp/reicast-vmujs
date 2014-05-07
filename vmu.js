function parseVMU(file, callback) {
    var reader = new FileReader();

    // Closure to capture the file information.
    reader.onload = 
    function(e) {
      var vmu = {}
      var bits = vmu.bits = new Uint8Array(e.target.result);
      
      var hash = "";
      for (var i =0x15; i<=0x3f;i++) {
        hash += ("00" + bits[255*512 + i]).slice(-2);
      }
      vmu.hash = sha1Hash(hash);
      vmu.color = [128, 128, 128, 255];
      
      if (bits[255*512 + 0x10]) {
        vmu.color =  [ bits[255*512 + 0x11],  bits[255*512 + 0x12], bits[255*512 + 0x13],  bits[255*512 + 0x14] ];
      }

      var files = vmu.files = [];
      
      for (var i = 253; i>=241; i--) {
        for (var j=0; j<(512/32); j++) {
          var base = i * 512 + j* 32;
          
          if (bits[base + 0]) {
            var file = {};
            file.type = bits[base + 0] == 0x33 ? "data" : "game";
            file.copyProtect = bits[base + 1] == 0xff;
            file.firstBlock = bits[base + 2] | bits[base + 3] *256;
            
            file.name = "";
            for (var k = 0x4; k<= 0xf; k++) 
              file.name += String.fromCharCode(bits[base + k]);

            file.timestamp = Array.prototype.join.call(bits.subarray(base + 0x10, base + 0x18), "");
            file.fileSize = bits[base + 0x18] | bits[base + 0x19] *256;
            file.headerOffset = bits[base + 0x1a] | bits[base + 0x1b] *256;
            file.extra = Array.prototype.join.call(bits.subarray(base + 0x1c, base + 0x20), " ");
            
            files.push(file);
          }
        }
      }
      
      callback(vmu);
    };

    // Read in the image file as a data URL.
    reader.readAsArrayBuffer(file)
}