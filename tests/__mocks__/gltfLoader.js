class GLTFLoader {
  setDRACOLoader(_loader) {
    return this;
  }

  load(_url, _onLoad, _onProgress, _onError) {
    // No-op in tests — don't invoke onLoad so no scene mutation occurs.
  }
}
module.exports = { GLTFLoader };
