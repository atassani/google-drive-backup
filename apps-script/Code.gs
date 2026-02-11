function ping() {
  return { ok: true, ts: new Date().toISOString() };
}

function copySlidesInto(originId, destId) {
  if (!originId || !destId) {
    throw new Error('originId and destId are required');
  }

  var origin = SlidesApp.openById(originId);
  var dest = SlidesApp.openById(destId);

  // Remove existing slides in destination (typically the default blank slide)
  var destSlides = dest.getSlides();
  for (var i = destSlides.length - 1; i >= 0; i--) {
    destSlides[i].remove();
  }

  var slides = origin.getSlides();
  for (var j = 0; j < slides.length; j++) {
    dest.appendSlide(slides[j]);
  }

  return { copied: slides.length };
}
