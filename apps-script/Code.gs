function ping() {
  return { ok: true, ts: new Date().toISOString() };
}

function copyDocInto(originId, destId) {
  if (!originId || !destId) {
    throw new Error('originId and destId are required');
  }

  var origin = DocumentApp.openById(originId);
  var dest = DocumentApp.openById(destId);

  var destBody = dest.getBody();
  destBody.clear();

  var sourceBody = origin.getBody();
  var total = sourceBody.getNumChildren();
  for (var i = 0; i < total; i++) {
    var child = sourceBody.getChild(i).copy();
    var type = child.getType();
    switch (type) {
      case DocumentApp.ElementType.PARAGRAPH:
        destBody.appendParagraph(child);
        break;
      case DocumentApp.ElementType.TABLE:
        destBody.appendTable(child);
        break;
      case DocumentApp.ElementType.LIST_ITEM:
        destBody.appendListItem(child);
        break;
      case DocumentApp.ElementType.HORIZONTAL_RULE:
        destBody.appendHorizontalRule();
        break;
      case DocumentApp.ElementType.INLINE_IMAGE:
        destBody.appendImage(child);
        break;
      case DocumentApp.ElementType.PAGE_BREAK:
        destBody.appendPageBreak();
        break;
      default:
        // Fallback: try appending as paragraph
        try {
          destBody.appendParagraph(child.asParagraph());
        } catch (e) {
          // Ignore unsupported element types
        }
        break;
    }
  }

  return { copied: total };
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
