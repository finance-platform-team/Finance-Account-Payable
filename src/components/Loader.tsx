export default function Loader() {
  return (
    <div className="loading-overlay">
      <div className="spinner-container">
        <div className="spinner-ring"></div>
        <div className="spinner-bar"></div>
      </div>
      <div className="loading-text">Loading Data...</div>
    </div>
  );
}