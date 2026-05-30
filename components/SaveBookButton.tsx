"use client";

type SaveBookButtonProps = {
  bookTitle: string;
};

export default function SaveBookButton({ bookTitle }: SaveBookButtonProps) {
  function saveBook() {
    const savedBooks = JSON.parse(
      localStorage.getItem("ndl_my_library") || "[]"
    );

    if (!savedBooks.includes(bookTitle)) {
      localStorage.setItem(
        "ndl_my_library",
        JSON.stringify([...savedBooks, bookTitle])
      );
    }

    alert(`${bookTitle} saved to My Library`);
  }

  return (
    <button
      type="button"
      onClick={saveBook}
      className="bg-green-600 text-white px-8 py-4 rounded-2xl hover:bg-green-700 shadow-lg"
    >
      Save to My Library
    </button>
  );
}