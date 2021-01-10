
export const getUploadURL = () => {
  const res = await fetch(`${process.env.REACT_APP_HOST_URL}/file/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [API_AUTH_HEADER]: apiKey,
      ...API_EXTRA_HEADERS,
    },
    body: JSON.stringify({ url: location })
  });
  if (res.status !== 200) {
    throw new Error('Failed to get upload location');
  }
}
