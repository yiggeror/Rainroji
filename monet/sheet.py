"""Contact sheet: python3 sheet.py OUT.jpg H COLS t1 t2 ..."""
import sys, numpy as np, cv2
from render import frame
out, H, cols = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
ts = [float(x) for x in sys.argv[4:]]
ims = []
for t in ts:
    im = np.ascontiguousarray(frame(t, H)[:, :, ::-1])
    cv2.putText(im, '%.1f' % t, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    ims.append(im)
while len(ims) % cols:
    ims.append(np.zeros_like(ims[0]))
rows = [np.concatenate(ims[i:i + cols], axis=1) for i in range(0, len(ims), cols)]
cv2.imwrite(out, np.concatenate(rows, axis=0), [cv2.IMWRITE_JPEG_QUALITY, 90])
