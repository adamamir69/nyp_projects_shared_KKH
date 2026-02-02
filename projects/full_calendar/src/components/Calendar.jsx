import React, {useState} from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, {Draggable} from "@fullcalendar/interaction"
import * as bootstrap from "bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css"

function Calendar() {
  //Event setting
  //details inside
  //creates an event
  //setEvents is used to update the event list
  const [events, setEvents] = useState([
    {
      title: "The title",
      start: "2026-01-04T08:00:00",
      end: "2026-01-04T10:00:00"
    },
  ]);
  //stores the event user clicked for editing
  //null means the form is in add event ui
  const [editingEvent,setEditingEvent] = useState(null);
  //form fields tht stores values typed by user
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  //when form is submitted, stops refresh page
  const handleAddEvent = (e)=>{
    e.preventDefault();
    //checks if its updating or adding event
    if (editingEvent) {
      // loops through the events and finds one with same title
      //as selected event
      //replaces the title,start,end with new values
      const updated = events.map(ev =>
        ev.title === editingEvent.title
          ? { ...ev, title, start, end }
          : ev
      );
      //saves updated list
      //exit edit mode
      setEvents(updated);
      setEditingEvent(null);
    }
    //makes a new array with old events and the new one
    else {
      setEvents([
        ...events,
        { title, start, end }
      ]);
    }
    //clears the input fields to empty
    setTitle("");
    setStart("");
    setEnd("");
  }
  //when event is clicksed it gets the FullCalendar event obj
  const handleEventClick = (info) => {
    const event = info.event;
    //fills the form with that specific event data
    setTitle(event.title);
    setStart(event.startStr);
    setEnd(event.endStr);
    //switches to the edit UI
    setEditingEvent(event);
  };
  //triggers when user drags or resizes an event
  const handleEventChange = (changeInfo) => {
    //will find the changed event and update the new duration
    const updated = events.map(ev =>
      ev.title === changeInfo.event.title
        ? {
            ...ev,
            start: changeInfo.event.startStr,
            end: changeInfo.event.endStr
          }
        : ev
    );
    //save changes
    setEvents(updated);
  };

  const handleDelete = () => {
    //only works if smth is being edited
    if (!editingEvent) return;
    //remove that event frm list
    const filtered = events.filter(
      ev => ev.title !== editingEvent.title
    );
    //save and exit editing ui
    setEvents(filtered);
    setEditingEvent(null);

    //clear form
    setTitle("");
    setStart("");
    setEnd("");
  };
  //return to add event without saving
  //handles the issue where once you click on an event, the edit ui stays and you cant get out
  const handleCancelEdit = () => {
    setEditingEvent(null);
    setTitle("");
    setStart("");
    setEnd("");
  };


  return (
    <>
    <div>
      <form onSubmit={handleAddEvent} className="mb-3">
        <input
          className="form-control mb-2"
          placeholder="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <input
          type="datetime-local"
          className="form-control mb-2"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />

        <input
          type="datetime-local"
          className="form-control mb-2"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
        />

        <button className="btn btn-primary me-2">
        {/*text changes based on edit or add mode */}
          {editingEvent ? "Update Event" : "Add Event"}
        </button>
        {editingEvent && (
          <>
            <button
              type="button"
              className="btn btn-danger me-2"
              onClick={handleDelete}
            >
              Delete Event
            </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancelEdit}
          >
            Cancel
          </button>  
          </>
        )}
      </form>
      <FullCalendar 
          plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]}
          initialView={"dayGridMonth"}

          editable={true}
          selectable={true}
          
          events={events}
          
          eventClick={handleEventClick}

          eventChange={handleEventChange}

          headerToolbar={{
              start: 'dayGridMonth, timeGridWeek, timeGridDay', // will normally be on the left. if RTL, will be on the right
              center: 'title',
              end: 'today prev,next' // will normally be on the right. if RTL, will be on the left
          }}
          // height={"90vh"}
          //triggers after each event is rendered
          eventDidMount={(info)=>{
            // creates a bootstrap popover
            return new bootstrap.Popover(info.el,{
              title: info.event.title,
              placement:"auto",
              trigger:"hover",
              // displays start and end
              content: `
                <p><strong>Start:</strong> ${info.event.startStr}</p>
                <p><strong>End:</strong> ${info.event.endStr || "N/A"}</p>
              `,
              html: true,
            })
          }}
      />
    </div>
    </>
  )
}

export default Calendar