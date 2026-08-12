import Modal from "./Modal";

export default function ConfirmDialog({ open, title = "Are you sure?", message, confirmLabel = "Confirm", danger, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width={400} footer={
      <>
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>{confirmLabel}</button>
      </>
    }>
      <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>{message}</p>
    </Modal>
  );
}
