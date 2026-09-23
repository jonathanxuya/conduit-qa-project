import { useEffect, useState } from "react";
import getTags from "../../services/getTags";
import TagButton from "./TagButton";

function PopularTags() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);

    getTags()
      .then((data) => {
        setTags(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.error("Error loading tags:", error);
        setTags([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <aside className="col-md-3">
      <div className="sidebar">
        <h6>Popular Tags</h6>

        <div className="tag-list">
          {loading ? (
            <p>Loading tags...</p>
          ) : tags.length > 0 ? (
            <TagButton tagsList={tags} />
          ) : (
            <p>Tags list not available</p>
          )}
        </div>
      </div>
    </aside>
  );
}

export default PopularTags;